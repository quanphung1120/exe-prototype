import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BadRequestException, ConflictException } from "@nestjs/common"
import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import { isTransactionsUnsupported } from "../src/common/mongo-util.js"
import {
  BookingDecisionDto,
  CancelBookingDto,
  CreateBookingDto,
} from "../src/features/bookings/bookings.dto.js"
import {
  assertNoCourtBlock,
  assertWithinHours,
  bookingsOverlap,
  bookingSlotFields,
  bookingSummaryFrom,
  buildBookingRecord,
  liveBookingOverlap,
  refundPctFor,
  reservationFromBooking,
  userBookingsOverlap,
  type BookingSlot,
  type UserBookingSlot,
} from "../src/features/bookings/booking.helpers.js"
import { addMinutesToIso } from "../src/shared/index.js"
import type { CourtBlock, Venue, VenueCourt } from "../src/shared/index.js"

/**
 * Pure-helper tests for the Phase 2 bookings feature: the overlap guard's
 * pure predicate, the BookingRecord → operator Reservation projection, and the
 * transactions-unsupported detector the transaction/lock-doc overlap guard
 * falls back on.
 */

const TODAY_ISO = "2026-07-20"

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "v9",
    name: "QA Arena",
    initials: "QA",
    district: "Cầu Giấy",
    city: "Hà Nội",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    rating: 4.6,
    reviews: 128,
    manager: { name: "Quan", initials: "Q" },
    now: "14:00",
    ...overrides,
  }
}

function makeCourt(overrides: Partial<VenueCourt> = {}): VenueCourt {
  return {
    id: "v9c1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Thảm",
    state: "available",
    utilToday: 40,
    pricePerHour: 180000,
    ...overrides,
  }
}

function makeSlot(overrides: Partial<BookingSlot> = {}): BookingSlot {
  return {
    bookingId: "b1",
    courtId: "v9c1",
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    status: "confirmed",
    ...overrides,
  }
}

// ── bookingsOverlap ──────────────────────────────────────────────────────────

void test("bookingsOverlap blocks an overlapping slot on the same court+day", () => {
  const existing = [makeSlot({ start: "18:00", durationMin: 60 })]
  assert.ok(bookingsOverlap(existing, "v9c1", TODAY_ISO, "18:30", 60))
})

void test("bookingsOverlap allows a back-to-back (non-overlapping) slot", () => {
  const existing = [makeSlot({ start: "18:00", durationMin: 60 })]
  assert.equal(bookingsOverlap(existing, "v9c1", TODAY_ISO, "19:00", 60), false)
})

void test("bookingsOverlap ignores a different court or a different day", () => {
  const existing = [
    makeSlot({ courtId: "v9c2", start: "18:00", durationMin: 60 }),
    makeSlot({ dateKey: "2026-07-21", start: "18:00", durationMin: 60 }),
  ]
  assert.equal(bookingsOverlap(existing, "v9c1", TODAY_ISO, "18:00", 60), false)
})

void test("bookingsOverlap frees the slot for cancelled/no-show/expired bookings", () => {
  const existing = [
    makeSlot({ start: "18:00", durationMin: 60, status: "cancelled" }),
    makeSlot({ start: "18:00", durationMin: 60, status: "no-show" }),
    makeSlot({ start: "18:00", durationMin: 60, status: "expired" }),
  ]
  assert.equal(bookingsOverlap(existing, "v9c1", TODAY_ISO, "18:00", 60), false)
})

void test("bookingsOverlap still blocks on a completed booking (parity with pre-Phase-2 behavior)", () => {
  const existing = [
    makeSlot({ start: "18:00", durationMin: 60, status: "completed" }),
  ]
  assert.ok(bookingsOverlap(existing, "v9c1", TODAY_ISO, "18:00", 60))
})

void test("bookingsOverlap excludes the booking being moved/re-written", () => {
  const existing = [
    makeSlot({ bookingId: "self", start: "18:00", durationMin: 60 }),
  ]
  assert.equal(
    bookingsOverlap(existing, "v9c1", TODAY_ISO, "18:00", 60, "self"),
    false
  )
})

// ── assertNoCourtBlock / liveBookingOverlap (decision #12) ──────────────────

function makeBlock(overrides: Partial<CourtBlock> = {}): CourtBlock {
  return {
    id: "v9b1",
    courtId: "v9c1",
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    reason: "maintenance",
    ...overrides,
  }
}

void test("assertNoCourtBlock throws a Conflict on an overlapping block", () => {
  const blocks = [makeBlock({ start: "18:00", durationMin: 60 })]
  assert.throws(
    () => assertNoCourtBlock(blocks, "v9c1", TODAY_ISO, "18:30", 30),
    ConflictException
  )
})

void test("assertNoCourtBlock is silent on a different court/day or a non-overlapping time", () => {
  const blocks = [makeBlock({ start: "18:00", durationMin: 60 })]
  assert.doesNotThrow(() =>
    assertNoCourtBlock(blocks, "v9c2", TODAY_ISO, "18:00", 60)
  )
  assert.doesNotThrow(() =>
    assertNoCourtBlock(blocks, "v9c1", "2026-07-21", "18:00", 60)
  )
  assert.doesNotThrow(() =>
    assertNoCourtBlock(blocks, "v9c1", TODAY_ISO, "19:00", 60)
  )
})

void test("assertNoCourtBlock is silent with no blocks (older venue docs default to [])", () => {
  assert.doesNotThrow(() =>
    assertNoCourtBlock([], "v9c1", TODAY_ISO, "18:00", 60)
  )
})

void test("liveBookingOverlap blocks only pending/confirmed/checked-in, not completed/cancelled/no-show/expired/awaiting_payment", () => {
  const live: BookingSlot[] = ["pending", "confirmed", "checked-in"].map(
    (status, i) =>
      makeSlot({
        bookingId: `live-${i}`,
        status: status as BookingSlot["status"],
      })
  )
  for (const slot of live) {
    assert.ok(
      liveBookingOverlap([slot], "v9c1", TODAY_ISO, "18:00", 60),
      `expected ${slot.status} to block a new court block`
    )
  }
  const notLive: BookingSlot[] = [
    "completed",
    "cancelled",
    "no-show",
    "expired",
    "awaiting_payment",
  ].map((status, i) =>
    makeSlot({
      bookingId: `dead-${i}`,
      status: status as BookingSlot["status"],
    })
  )
  for (const slot of notLive) {
    assert.equal(
      liveBookingOverlap([slot], "v9c1", TODAY_ISO, "18:00", 60),
      false,
      `expected ${slot.status} to NOT block a new court block`
    )
  }
})

// ── assertWithinHours ────────────────────────────────────────────────────────

void test("assertWithinHours rejects a duration not on a 15-minute step", () => {
  assert.throws(
    () => assertWithinHours(makeVenue(), "18:00", 40),
    BadRequestException
  )
})

void test("assertWithinHours rejects a slot spilling past closing", () => {
  assert.throws(
    () => assertWithinHours(makeVenue({ openTo: "22:00" }), "21:30", 60),
    BadRequestException
  )
})

void test("assertWithinHours accepts a slot inside opening hours", () => {
  assert.doesNotThrow(() => assertWithinHours(makeVenue(), "18:00", 90))
})

// ── buildBookingRecord / bookingSlotFields ────────────────────────────────────

void test("buildBookingRecord derives startAt/endAt/price and seeds statusHistory", () => {
  const record = buildBookingRecord({
    venueId: "v9",
    court: makeCourt({ pricePerHour: 180000 }),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 90,
    source: "app",
    status: "pending",
    paymentStatus: "paid",
    customer: { name: "Khách", initials: "K" },
    userId: "user-1",
    sessionId: "s-1",
  })
  assert.equal(record.venueId, "v9")
  assert.equal(record.courtId, "v9c1")
  assert.equal(record.startAt, `${TODAY_ISO}T18:00:00+07:00`)
  assert.equal(record.endAt, `${TODAY_ISO}T19:30:00+07:00`)
  assert.equal(record.price, 270000) // 180000 * 1.5h
  assert.equal(record.statusHistory.length, 1)
  assert.equal(record.statusHistory[0]?.status, "pending")
})

void test("buildBookingRecord mints a distinct bookingId per call", () => {
  const a = buildBookingRecord({
    venueId: "v9",
    court: makeCourt(),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    source: "walk-in",
    status: "confirmed",
    paymentStatus: "none",
    customer: { name: "A", initials: "A" },
  })
  const b = buildBookingRecord({
    venueId: "v9",
    court: makeCourt(),
    dateKey: TODAY_ISO,
    start: "19:00",
    durationMin: 60,
    source: "walk-in",
    status: "confirmed",
    paymentStatus: "none",
    customer: { name: "B", initials: "B" },
  })
  assert.notEqual(a.bookingId, b.bookingId)
})

void test("bookingSlotFields re-derives court/time/price for a reschedule or re-write", () => {
  const fields = bookingSlotFields(
    makeCourt({ pricePerHour: 200000 }),
    TODAY_ISO,
    "20:00",
    30
  )
  assert.equal(fields.start, "20:00")
  assert.equal(fields.durationMin, 30)
  assert.equal(fields.price, 100000)
  assert.equal(fields.startAt, `${TODAY_ISO}T20:00:00+07:00`)
  assert.equal(fields.endAt, `${TODAY_ISO}T20:30:00+07:00`)
})

// ── reservationFromBooking ────────────────────────────────────────────────────

void test("reservationFromBooking preserves the operator Reservation shape (id, court, time)", () => {
  const record = buildBookingRecord({
    venueId: "v9",
    court: makeCourt({
      name: "Sân 3",
      sport: "badminton",
      pricePerHour: 240000,
    }),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    source: "app",
    status: "pending",
    paymentStatus: "paid",
    customer: { name: "Khách", initials: "K" },
    userId: "user-1",
    sessionId: "s-1",
  })
  const reservation = reservationFromBooking(record, TODAY_ISO)
  assert.equal(reservation.id, record.bookingId)
  assert.equal(reservation.court, "Sân 3")
  assert.equal(reservation.sport, "badminton")
  assert.equal(reservation.time, "18:00 – 19:00")
  assert.equal(reservation.party, 2) // badminton bookings are always party of 2
  assert.equal(reservation.status, "pending")
  assert.equal(reservation.noShowRisk, 10) // app source
})

void test("reservationFromBooking collapses the payment-gate states onto ReservationStatus", () => {
  const base = buildBookingRecord({
    venueId: "v9",
    court: makeCourt(),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    source: "app",
    status: "awaiting_payment",
    paymentStatus: "awaiting",
    customer: { name: "Khách", initials: "K" },
  })
  // An active, unpaid hold projects to the distinct, non-actionable "held"
  // status (not "pending" — the operator can't approve it; payment gates that).
  assert.equal(reservationFromBooking(base, TODAY_ISO).status, "held")
  assert.equal(
    reservationFromBooking({ ...base, status: "expired" }, TODAY_ISO).status,
    "cancelled"
  )
})

void test("reservationFromBooking gives walk-ins a lower noShowRisk than app bookings", () => {
  const record = buildBookingRecord({
    venueId: "v9",
    court: makeCourt(),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    source: "walk-in",
    status: "confirmed",
    paymentStatus: "none",
    customer: { name: "Khách", initials: "K" },
  })
  assert.equal(reservationFromBooking(record, TODAY_ISO).noShowRisk, 5)
})

// ── isTransactionsUnsupported ──────────────────────────────────────────────────

void test("isTransactionsUnsupported recognizes the IllegalOperation code (20)", () => {
  const err = Object.assign(
    new Error(
      "Transaction numbers are only allowed on a replica set member or mongos"
    ),
    {
      code: 20,
    }
  )
  assert.ok(isTransactionsUnsupported(err))
})

void test("isTransactionsUnsupported recognizes the message pattern without a code", () => {
  const err = new Error("Transactions are not supported by this deployment")
  assert.ok(isTransactionsUnsupported(err))
})

void test("isTransactionsUnsupported rejects unrelated errors, including our own domain exceptions", () => {
  assert.equal(
    isTransactionsUnsupported(new ConflictException("overlap")),
    false
  )
  assert.equal(isTransactionsUnsupported(new Error("network timeout")), false)
  assert.equal(isTransactionsUnsupported("not an Error"), false)
  assert.equal(isTransactionsUnsupported(undefined), false)
})

// ── userBookingsOverlap (Phase 3: self-overlap hard block, decision #8) ──────

function makeUserSlot(
  overrides: Partial<UserBookingSlot> = {}
): UserBookingSlot {
  return {
    bookingId: "b1",
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    status: "confirmed",
    ...overrides,
  }
}

void test("userBookingsOverlap blocks an overlapping slot regardless of court/venue", () => {
  const existing = [makeUserSlot({ start: "18:00", durationMin: 60 })]
  assert.ok(userBookingsOverlap(existing, TODAY_ISO, "18:30", 60))
})

void test("userBookingsOverlap allows a back-to-back slot", () => {
  const existing = [makeUserSlot({ start: "18:00", durationMin: 60 })]
  assert.equal(userBookingsOverlap(existing, TODAY_ISO, "19:00", 60), false)
})

void test("userBookingsOverlap ignores a different day", () => {
  const existing = [
    makeUserSlot({ dateKey: "2026-07-21", start: "18:00", durationMin: 60 }),
  ]
  assert.equal(userBookingsOverlap(existing, TODAY_ISO, "18:00", 60), false)
})

void test("userBookingsOverlap frees the slot for cancelled/no-show/expired bookings", () => {
  const existing = [
    makeUserSlot({ start: "18:00", durationMin: 60, status: "cancelled" }),
    makeUserSlot({ start: "18:00", durationMin: 60, status: "no-show" }),
    makeUserSlot({ start: "18:00", durationMin: 60, status: "expired" }),
  ]
  assert.equal(userBookingsOverlap(existing, TODAY_ISO, "18:00", 60), false)
})

void test("userBookingsOverlap excludes the booking being re-written", () => {
  const existing = [
    makeUserSlot({ bookingId: "self", start: "18:00", durationMin: 60 }),
  ]
  assert.equal(
    userBookingsOverlap(existing, TODAY_ISO, "18:00", 60, "self"),
    false
  )
})

// ── refundPctFor (cancellation policy, decision #6) ─────────────────────────

void test("refundPctFor gives 100% at exactly 24h before the start", () => {
  const now = "2026-07-20T10:00:00+07:00"
  const startAt = "2026-07-21T10:00:00+07:00" // exactly 24h out
  assert.equal(refundPctFor(now, startAt), 100)
})

void test("refundPctFor gives 50% inside the 24h window but before the start", () => {
  const now = "2026-07-20T10:00:00+07:00"
  const startAt = "2026-07-21T09:00:00+07:00" // 23h out
  assert.equal(refundPctFor(now, startAt), 50)
})

void test("refundPctFor gives 0% at or after the start time", () => {
  const now = "2026-07-21T10:00:00+07:00"
  assert.equal(refundPctFor(now, "2026-07-21T10:00:00+07:00"), 0)
  assert.equal(refundPctFor(now, "2026-07-21T09:00:00+07:00"), 0)
})

// ── bookingSummaryFrom ───────────────────────────────────────────────────────

void test("bookingSummaryFrom exposes hold/payment/refund fields the Reservation projection omits", () => {
  const record = buildBookingRecord({
    venueId: "v9",
    court: makeCourt(),
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    source: "app",
    status: "awaiting_payment",
    paymentStatus: "awaiting",
    customer: { name: "Khách", initials: "K" },
    userId: "user-1",
    holdExpiresAt: "2026-07-20T14:20:00+07:00",
  })
  const summary = bookingSummaryFrom(record)
  assert.equal(summary.holdExpiresAt, "2026-07-20T14:20:00+07:00")
  assert.equal(summary.paymentStatus, "awaiting")
  assert.equal(summary.venueId, "v9")
  // The venue-facing Reservation shape's `customer`/`statusHistory` aren't
  // part of this projection.
  assert.equal((summary as Record<string, unknown>).customer, undefined)
})

// ── addMinutesToIso (shared/helpers.ts) ─────────────────────────────────────

void test("addMinutesToIso shifts an ISO datetime by whole minutes, wrapping the day/offset", () => {
  assert.equal(
    addMinutesToIso("2026-07-20T23:50:00+07:00", 20),
    "2026-07-21T00:10:00+07:00"
  )
  assert.equal(
    addMinutesToIso("2026-07-20T14:00:00+07:00", 20),
    "2026-07-20T14:20:00+07:00"
  )
})

// ── bookings.dto.ts (class-validator) ───────────────────────────────────────

function dtoErrors(cls: new () => object, input: unknown): number {
  const dto = plainToInstance(cls, input)
  return validateSync(dto).length
}

void test("CreateBookingDto requires courtId/dateKey/an HH:MM start/an in-range duration", () => {
  assert.equal(
    dtoErrors(CreateBookingDto, {
      courtId: "v9c1",
      dateKey: TODAY_ISO,
      start: "18:00",
      durationMin: 60,
    }),
    0
  )
  assert.notEqual(
    dtoErrors(CreateBookingDto, {
      courtId: "v9c1",
      dateKey: TODAY_ISO,
      start: "18:60",
      durationMin: 60,
    }),
    0
  )
  assert.notEqual(
    dtoErrors(CreateBookingDto, {
      courtId: "v9c1",
      dateKey: TODAY_ISO,
      start: "18:00",
      durationMin: 5, // below the 15-minute floor
    }),
    0
  )
  // The DTO only bounds durationMin — the 15-minute *step* is a business rule
  // enforced server-side by `assertWithinHours` (see the tests above), not a
  // class-validator constraint.
})

void test("CancelBookingDto's reason is optional but must be >=3 chars when given", () => {
  assert.equal(dtoErrors(CancelBookingDto, {}), 0)
  assert.notEqual(dtoErrors(CancelBookingDto, { reason: "no" }), 0)
  assert.equal(dtoErrors(CancelBookingDto, { reason: "Đổi lịch" }), 0)
})

void test("BookingDecisionDto requires a reason (>=3 chars) only when declining", () => {
  assert.equal(dtoErrors(BookingDecisionDto, { decision: "approve" }), 0)
  assert.notEqual(dtoErrors(BookingDecisionDto, { decision: "decline" }), 0)
  assert.notEqual(
    dtoErrors(BookingDecisionDto, { decision: "decline", reason: "no" }),
    0
  )
  assert.equal(
    dtoErrors(BookingDecisionDto, { decision: "decline", reason: "Hết sân" }),
    0
  )
})

void test("BookingDecisionDto rejects a decision outside approve/decline", () => {
  assert.notEqual(dtoErrors(BookingDecisionDto, { decision: "maybe" }), 0)
})
