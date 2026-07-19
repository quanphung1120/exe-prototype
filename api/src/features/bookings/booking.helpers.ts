// Pure helpers for the bookings feature — no Mongo/Nest DI, so these are
// unit-testable without a database (see test/booking-helpers.test.ts).

import { BadRequestException } from "@nestjs/common"
import { Types } from "mongoose"

import {
  addMinutes,
  combineDateTime,
  dayLabelFor,
  priceFor,
  rangesOverlap,
  slotRange,
  toMinutes,
  vnNowIso,
  type BookingCustomer,
  type BookingRecord,
  type BookingRecordStatus,
  type BookingSource,
  type PaymentStatus,
  type Reservation,
  type ReservationStatus,
  type Venue as VenueInfo,
  type VenueCourt,
} from "../../shared/index.js"

// ── Opening hours ────────────────────────────────────────────────────────────

/** Reject a slot whose duration isn't a 15-min multiple or spills past hours. */
export function assertWithinHours(
  venue: VenueInfo,
  start: string,
  durationMin: number
): void {
  const startMin = toMinutes(start)
  const endMin = startMin + durationMin
  if (durationMin < 15 || durationMin % 15 !== 0) {
    throw new BadRequestException("Duration must be in 15-minute steps")
  }
  if (
    startMin < toMinutes(venue.openFrom) ||
    endMin > toMinutes(venue.openTo)
  ) {
    throw new BadRequestException(
      "Reservation must stay within venue opening hours"
    )
  }
}

// ── Overlap ──────────────────────────────────────────────────────────────────

/**
 * Statuses that no longer hold their slot — mirrors the pre-Phase-2
 * `overlapsReservation`, which only freed "cancelled"/"no-show". `expired`
 * (an unpaid hold that lapsed) joins them; every other status — including
 * `completed`, kept for parity with the old behavior — still blocks the slot.
 */
const NON_BLOCKING_STATUSES = new Set<BookingRecordStatus>([
  "cancelled",
  "no-show",
  "expired",
])

/** The minimal shape the overlap check reads off a booking. */
export interface BookingSlot {
  bookingId: string
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  status: BookingRecordStatus
}

/**
 * True when a proposed slot on `courtId`/`dateKey` overlaps a live booking in
 * `existing` (bookings already filtered to that court+day). `excludeId` skips
 * a booking being moved (reschedule) or re-written (idempotent app-booking
 * PUT). Pure and pre-filtered so the caller can run it inside a transaction
 * or a lock-guarded critical section without any I/O here.
 */
export function bookingsOverlap(
  existing: BookingSlot[],
  courtId: string,
  dateKey: string,
  start: string,
  durationMin: number,
  excludeId?: string
): boolean {
  return existing.some((b) => {
    if (excludeId && b.bookingId === excludeId) return false
    if (b.courtId !== courtId || b.dateKey !== dateKey) return false
    if (NON_BLOCKING_STATUSES.has(b.status)) return false
    return rangesOverlap(start, durationMin, b.start, b.durationMin)
  })
}

// ── Building / updating a BookingRecord ────────────────────────────────────

export interface NewBookingInput {
  venueId: string
  court: VenueCourt
  dateKey: string
  start: string
  durationMin: number
  source: BookingSource
  status: BookingRecordStatus
  paymentStatus: PaymentStatus
  customer: BookingCustomer
  userId?: string
  sessionId?: string
}

/** A fresh `BookingRecord` (bookingId is a Mongo ObjectId hex string). */
export function buildBookingRecord(input: NewBookingInput): BookingRecord {
  const startAt = combineDateTime(input.dateKey, input.start)
  const endAt = combineDateTime(
    input.dateKey,
    addMinutes(input.start, input.durationMin)
  )
  return {
    bookingId: new Types.ObjectId().toHexString(),
    venueId: input.venueId,
    courtId: input.court.id,
    courtName: input.court.name,
    sport: input.court.sport,
    source: input.source,
    userId: input.userId,
    sessionId: input.sessionId,
    customer: input.customer,
    startAt,
    endAt,
    dateKey: input.dateKey,
    start: input.start,
    durationMin: input.durationMin,
    price: priceFor(input.court.pricePerHour, input.durationMin),
    status: input.status,
    paymentStatus: input.paymentStatus,
    statusHistory: [{ status: input.status, at: vnNowIso() }],
  }
}

/** The fields a court/slot re-write (app-booking re-PUT, reschedule) touches. */
export function bookingSlotFields(
  court: VenueCourt,
  dateKey: string,
  start: string,
  durationMin: number
) {
  return {
    courtId: court.id,
    courtName: court.name,
    sport: court.sport,
    dateKey,
    start,
    durationMin,
    startAt: combineDateTime(dateKey, start),
    endAt: combineDateTime(dateKey, addMinutes(start, durationMin)),
    price: priceFor(court.pricePerHour, durationMin),
  }
}

// ── Projection: BookingRecord → the venue's Reservation view ──────────────────

/**
 * Collapse the two payment-gate states a future phase introduces onto the
 * six-value `ReservationStatus` the venue UI already understands: an unpaid
 * hold reads as "pending" (something is holding the slot), a lapsed one reads
 * as "cancelled" (the slot freed up). Exhaustive switch (no default) so a new
 * `BookingRecordStatus` fails the build here instead of silently falling
 * through.
 */
function reservationStatusFromBooking(
  status: BookingRecordStatus
): ReservationStatus {
  switch (status) {
    case "awaiting_payment":
      return "pending"
    case "expired":
      return "cancelled"
    case "pending":
    case "confirmed":
    case "checked-in":
    case "completed":
    case "cancelled":
    case "no-show":
      return status
  }
}

/** The minimal shape the projection reads off a booking (lean doc or instance). */
export type BookingLean = Pick<
  BookingRecord,
  | "bookingId"
  | "customer"
  | "userId"
  | "sessionId"
  | "sport"
  | "courtId"
  | "courtName"
  | "dateKey"
  | "start"
  | "durationMin"
  | "startAt"
  | "endAt"
  | "source"
  | "status"
  | "price"
  | "declineReason"
>

/**
 * Project one `BookingRecord` to the venue operator's `Reservation` shape — the
 * UI contract stays exactly what it was when reservations were embedded on the
 * venue doc (VienTD-Review #08: "shape UI venue không đổi"). `party`/`noShowRisk`/
 * `isRegular` were write-time-only heuristics before Phase 2 too (never
 * recomputed after creation), so deriving them here at read time changes
 * nothing observable.
 */
export function reservationFromBooking(
  booking: BookingLean,
  todayIso: string
): Reservation {
  return {
    id: booking.bookingId,
    customer: booking.customer,
    userId: booking.userId,
    sessionId: booking.sessionId,
    sport: booking.sport,
    courtId: booking.courtId,
    court: booking.courtName,
    dayKey: booking.dateKey,
    day: dayLabelFor(booking.dateKey, todayIso),
    start: booking.start,
    durationMin: booking.durationMin,
    startAt: booking.startAt,
    endAt: booking.endAt,
    time: slotRange(booking.start, booking.durationMin),
    party: booking.sport === "pickleball" ? 4 : 2,
    source: booking.source,
    status: reservationStatusFromBooking(booking.status),
    price: booking.price,
    noShowRisk: booking.source === "walk-in" ? 5 : 10,
    isRegular: false,
    declineReason: booking.declineReason,
  }
}
