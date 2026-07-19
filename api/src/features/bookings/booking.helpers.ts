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
  type NotificationItem,
  type PaymentStatus,
  type RefundQueueItem,
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

// ── Court blocks (seam for Phase 6) ─────────────────────────────────────────

/**
 * Seam for Phase 6 court-block enforcement (VienTD-Review decision #12): once
 * `CourtBlock` entities exist (start/end + a required reason, rejecting
 * booking/walk-in overlap), this is the single call site that will query them
 * and throw a `ConflictException` on overlap — see `bookings.service.ts#createHold`.
 * No blocks exist yet, so this is a deliberate no-op today.
 */
export function assertNoCourtBlock(
  venueId: string,
  courtId: string,
  dateKey: string,
  start: string,
  durationMin: number
): void {
  // Intentionally empty — Phase 6 fills this in. Referencing the params (as a
  // no-op) keeps the seam's signature exact without an unused-args lint error.
  void venueId
  void courtId
  void dateKey
  void start
  void durationMin
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

/** The minimal shape the self-overlap check reads off one user's bookings. */
export interface UserBookingSlot {
  bookingId: string
  dateKey: string
  start: string
  durationMin: number
  status: BookingRecordStatus
}

/**
 * True when a proposed slot overlaps a live booking of `existing` (a user's
 * own bookings, already filtered to that user) *regardless of court/venue* —
 * VienTD-Review decision #8: a player may not hold two courts (anywhere) at
 * once. Hard-blocked at `POST /api/bookings` (`bookings.service.ts#createHold`);
 * unlike `bookingsOverlap`, this never gates a write inside the per-court
 * transaction/lock (a user's bookings can span many venues), so it's a
 * best-effort pre-check rather than a fully race-proof guard.
 */
export function userBookingsOverlap(
  existing: UserBookingSlot[],
  dateKey: string,
  start: string,
  durationMin: number,
  excludeId?: string
): boolean {
  return existing.some((b) => {
    if (excludeId && b.bookingId === excludeId) return false
    if (b.dateKey !== dateKey) return false
    if (NON_BLOCKING_STATUSES.has(b.status)) return false
    return rangesOverlap(start, durationMin, b.start, b.durationMin)
  })
}

// ── Cancellation refund policy (decision #6) ────────────────────────────────

/**
 * Percent of the price refunded on a player-initiated cancel, by how far
 * `nowIso` sits before the booking's `startAt`: ≥24h → 100%, <24h → 50%, at or
 * after the start time → 0%. A venue *decline* is a flat 100% regardless of
 * timing (the venue's fault, not the player's) — that's applied directly by
 * the caller (`bookings.service.ts#decide`), not through this helper.
 */
export function refundPctFor(nowIso: string, startAt: string): number {
  const now = new Date(nowIso).getTime()
  const start = new Date(startAt).getTime()
  if (now >= start) return 0
  const hoursUntilStart = (start - now) / (60 * 60 * 1000)
  return hoursUntilStart >= 24 ? 100 : 50
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
  /** An unpaid hold's expiry (ISO, +07:00) — set only for `awaiting_payment`. */
  holdExpiresAt?: string
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
    holdExpiresAt: input.holdExpiresAt,
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

/** The minimal shape {@link refundQueueItemFromBooking} reads off a booking. */
export type RefundQueueLean = Pick<
  BookingRecord,
  "bookingId" | "customer" | "courtName" | "dateKey" | "start" | "durationMin" | "refund"
>

/**
 * Project one refunded `BookingRecord` to the operator's manual-refund
 * worklist row (VienTD-Review Phase 4: SePay has no refund API, so every
 * refund is computed here and settled by hand). Callers filter to
 * `refund.status === "manual"` first — `refund` is asserted non-null since a
 * row only reaches this projection once a refund has actually been recorded.
 */
export function refundQueueItemFromBooking(
  booking: RefundQueueLean,
  todayIso: string
): RefundQueueItem {
  return {
    bookingId: booking.bookingId,
    customer: booking.customer,
    court: booking.courtName,
    day: dayLabelFor(booking.dateKey, todayIso),
    time: slotRange(booking.start, booking.durationMin),
    refund: booking.refund!,
  }
}

// ── Projection: BookingRecord → the player-facing bookings API shape ──────────

/**
 * The canonical fields `api/src/features/bookings/bookings.controller.ts`
 * returns to the caller — everything a player/operator needs from a booking
 * mutation (hold expiry, payment state, refund) that the venue-scoped
 * `Reservation` projection above intentionally omits (its shape is frozen to
 * match the pre-existing venue UI contract).
 */
export type BookingSummary = Pick<
  BookingRecord,
  | "bookingId"
  | "venueId"
  | "courtId"
  | "courtName"
  | "sport"
  | "source"
  | "userId"
  | "sessionId"
  | "startAt"
  | "endAt"
  | "dateKey"
  | "start"
  | "durationMin"
  | "price"
  | "status"
  | "paymentStatus"
  | "holdExpiresAt"
  | "confirmDeadlineAt"
  | "checkedInAt"
  | "declineReason"
  | "cancelReason"
  | "refund"
>

/** Project a full `BookingRecord` (a lean/hydrated doc) to `BookingSummary`. */
export function bookingSummaryFrom(booking: BookingRecord): BookingSummary {
  return {
    bookingId: booking.bookingId,
    venueId: booking.venueId,
    courtId: booking.courtId,
    courtName: booking.courtName,
    sport: booking.sport,
    source: booking.source,
    userId: booking.userId,
    sessionId: booking.sessionId,
    startAt: booking.startAt,
    endAt: booking.endAt,
    dateKey: booking.dateKey,
    start: booking.start,
    durationMin: booking.durationMin,
    price: booking.price,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    holdExpiresAt: booking.holdExpiresAt,
    confirmDeadlineAt: booking.confirmDeadlineAt,
    checkedInAt: booking.checkedInAt,
    declineReason: booking.declineReason,
    cancelReason: booking.cancelReason,
    refund: booking.refund,
  }
}

// ── Player notification copy for an operator decision ─────────────────────────

/**
 * The player notification for an operator decision — or a sweeper-driven
 * clock transition — on their booking, or null when the transition is
 * silent. Pure (no DI) so `VenuesService` (the venue-scoped status route),
 * `BookingsService` (the narrower `POST /api/bookings/:id/decision` etc. and
 * the Phase 5 sweeper) all produce identical copy without depending on each
 * other. Every caller delivers the result via `NotificationsService#create`
 * (the dedicated `notifications` collection, Phase 7) — this function itself
 * stays a plain, DI-free builder.
 *
 * `prevStatus`/`status` take the full `BookingRecordStatus` domain (not just
 * the six-value `ReservationStatus`) so the sweeper can pass its two
 * clock-driven edges — `awaiting_payment → expired` and the auto-confirm
 * landing on `confirmed` — through the same function. `auto` distinguishes
 * that silent SLA auto-confirm (decision #5, "silence = consent") from a
 * manual operator approval — same target status, different copy so the
 * player understands why nobody actively approved it.
 */
export function decisionNotification(
  reservationId: string,
  prevStatus: BookingRecordStatus,
  status: BookingRecordStatus,
  reason?: string,
  auto = false
): NotificationItem | null {
  const base = { time: "Vừa xong", read: false, href: "/dashboard/bookings" }
  if (status === "cancelled" && prevStatus === "pending" && reason) {
    return {
      id: `booking-declined-${reservationId}`,
      kind: "booking",
      text: `Chủ sân đã từ chối đặt sân: ${reason}. Đã hoàn tiền (mô phỏng).`,
      ...base,
    }
  }
  if (status === "cancelled" && reason) {
    return {
      id: `booking-cancelled-${reservationId}`,
      kind: "booking",
      text: `Chủ sân đã huỷ đặt sân đã duyệt của bạn: ${reason}. Đã hoàn tiền (mô phỏng).`,
      ...base,
    }
  }
  if (status === "confirmed" && auto) {
    return {
      id: `booking-auto-confirmed-${reservationId}`,
      kind: "booking",
      text: "Đặt sân của bạn đã được tự động xác nhận do chủ sân chưa phản hồi trong thời gian quy định.",
      ...base,
    }
  }
  if (status === "confirmed") {
    return {
      id: `booking-approved-${reservationId}`,
      kind: "booking",
      text: "Chủ sân đã duyệt đặt sân của bạn.",
      ...base,
    }
  }
  if (status === "no-show") {
    return {
      id: `booking-no-show-${reservationId}`,
      kind: "booking",
      text: "Bạn đã được đánh dấu vắng mặt (no-show) cho lượt đặt sân này.",
      ...base,
    }
  }
  if (status === "expired") {
    return {
      id: `booking-expired-${reservationId}`,
      kind: "booking",
      text: "Đặt sân đã hết hạn do chưa hoàn tất thanh toán trong thời gian giữ chỗ.",
      ...base,
    }
  }
  return null
}
