import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"

import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { addMinutesToIso, vnNowIso } from "../src/shared/index.js"
import type { BookingRecordStatus, PaymentStatus } from "../src/shared/index.js"

/**
 * Phase 5 scheduler: `BookingsService.sweep` is the whole state machine
 * `payments/bookings-sweeper.service.ts` (the cron trigger) calls every
 * minute — the cron wrapper itself is thin enough it doesn't need its own
 * tests beyond "it calls the service" (same convention as every other
 * `*.sweeper`-shaped trigger in this codebase). These tests exercise
 * `sweep` directly against a mocked Mongoose model — same approach as
 * `bookings-service.test.ts` — so every rule's guard, idempotency and
 * cross-surface side effect (player notification, the `expiredBookingIds`
 * the sweeper trigger cancels each SePay order for) is pinned without a
 * real DB or a real gateway.
 */

interface FakeBooking {
  bookingId: string
  venueId: string
  userId?: string
  sessionId?: string
  status: BookingRecordStatus
  paymentStatus?: PaymentStatus
  holdExpiresAt?: string
  confirmDeadlineAt?: string
  endAt?: string
  checkedInAt?: string
  statusHistory: { status: BookingRecordStatus; at: string }[]
  save: () => Promise<void>
}

function makeBooking(overrides: Partial<FakeBooking> = {}): FakeBooking {
  return {
    bookingId: "b1",
    venueId: "v1",
    status: "awaiting_payment",
    statusHistory: [],
    save: () => Promise.resolve(),
    ...overrides,
  }
}

/** A stand-in `Query` — chainable (`.select().lean()`) and directly awaitable. */
function makeQuery<T>(result: T) {
  const q = {
    select: () => q,
    lean: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return q
}

/**
 * One in-memory set of "live" booking docs (mutated in place by `setStatus`,
 * so assertions after `sweep` read straight off the input array) — `find`
 * answers `sweep`'s three targeted queries by filtering on the same fields
 * the real Mongoose query does; `findOne` (used inside `setStatus`) resolves
 * the one doc a bookingId+venueId identifies.
 */
async function makeService(bookings: FakeBooking[]) {
  const notifications: { userId: string; item: unknown }[] = []

  const bookingModelMock = {
    find: (filter: {
      status?: BookingRecordStatus
      paymentStatus?: PaymentStatus
      holdExpiresAt?: { $lte: string }
      confirmDeadlineAt?: { $lte: string }
      endAt?: { $lte: string }
    }) =>
      makeQuery(
        bookings.filter((b) => {
          if (filter.status !== undefined && b.status !== filter.status)
            return false
          if (
            filter.paymentStatus !== undefined &&
            b.paymentStatus !== filter.paymentStatus
          )
            return false
          if (filter.holdExpiresAt)
            return !!b.holdExpiresAt && b.holdExpiresAt <= filter.holdExpiresAt.$lte
          if (filter.confirmDeadlineAt)
            return (
              !!b.confirmDeadlineAt &&
              b.confirmDeadlineAt <= filter.confirmDeadlineAt.$lte
            )
          if (filter.endAt)
            return !!b.endAt && b.endAt <= filter.endAt.$lte
          return true
        })
      ),
    findOne: (filter: { bookingId: string; venueId?: string }) =>
      makeQuery(
        bookings.find(
          (b) =>
            b.bookingId === filter.bookingId &&
            (filter.venueId === undefined || b.venueId === filter.venueId)
        ) ?? null
      ),
  }
  const profilesMock = {
    addNotification: (userId: string, item: unknown) => {
      notifications.push({ userId, item })
      return Promise.resolve()
    },
  }
  const configMock = { get: (_key: string, fallback?: unknown) => fallback }

  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingsService,
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(BookingLock.name), useValue: {} },
      { provide: getModelToken(Venue.name), useValue: {} },
      {
        provide: getConnectionToken(),
        useValue: { transaction: (fn: (s?: unknown) => Promise<unknown>) => fn(undefined) },
      },
      { provide: ProfileService, useValue: profilesMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile()

  return { service: moduleRef.get(BookingsService), notifications }
}

// ── Rule 1: awaiting_payment → expired ──────────────────────────────────────

void test("sweep expires an unpaid hold past holdExpiresAt and returns its bookingId to cancel", async () => {
  const booking = makeBooking({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:01+07:00")

  assert.deepEqual(result, {
    expired: 1,
    autoConfirmed: 0,
    completed: 0,
    expiredBookingIds: ["b1"],
  })
  assert.equal(booking.status, "expired")
})

void test("sweep leaves an unpaid hold alone before it expires", async () => {
  const booking = makeBooking({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T09:59:59+07:00")

  assert.equal(result.expired, 0)
  assert.equal(booking.status, "awaiting_payment")
})

// ── Rule 2: pending + paid → confirmed (silence = consent) ─────────────────

void test("sweep auto-confirms a paid pending booking past the confirm SLA and notifies the player", async () => {
  const booking = makeBooking({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
    userId: "u1",
  })
  const { service, notifications } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:00+07:00")

  assert.deepEqual(result, {
    expired: 0,
    autoConfirmed: 1,
    completed: 0,
    expiredBookingIds: [],
  })
  assert.equal(booking.status, "confirmed")
  assert.equal(notifications.length, 1)
  const item = notifications[0]?.item as { id: string; text: string }
  assert.match(item.id, /^booking-auto-confirmed-/)
  assert.match(item.text, /tự động xác nhận/)
})

void test("sweep does not auto-confirm a pending booking that isn't marked paid", async () => {
  const booking = makeBooking({
    status: "pending",
    paymentStatus: "awaiting",
    confirmDeadlineAt: "2026-07-20T09:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:00+07:00")

  assert.equal(result.autoConfirmed, 0)
  assert.equal(booking.status, "pending")
})

void test("sweep does not auto-confirm before the SLA deadline", async () => {
  const booking = makeBooking({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T10:30:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:00+07:00")

  assert.equal(result.autoConfirmed, 0)
  assert.equal(booking.status, "pending")
})

void test("sweep skips the auto-confirm notification for a walk-in with no linked user", async () => {
  const booking = makeBooking({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
    userId: undefined,
  })
  const { service, notifications } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:00+07:00")

  assert.equal(result.autoConfirmed, 1)
  assert.equal(notifications.length, 0)
})

// ── Rule 3: checked-in → completed ──────────────────────────────────────────

void test("sweep completes a checked-in booking past its endAt", async () => {
  const booking = makeBooking({
    status: "checked-in",
    endAt: "2026-07-20T19:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T19:00:01+07:00")

  assert.deepEqual(result, {
    expired: 0,
    autoConfirmed: 0,
    completed: 1,
    expiredBookingIds: [],
  })
  assert.equal(booking.status, "completed")
})

void test("sweep never touches no-show — it stays a manual venue action", async () => {
  const booking = makeBooking({
    status: "confirmed",
    endAt: "2026-01-01T00:00:00+07:00", // long past, but "confirmed" has no clock rule
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T19:00:01+07:00")

  assert.deepEqual(result, {
    expired: 0,
    autoConfirmed: 0,
    completed: 0,
    expiredBookingIds: [],
  })
  assert.equal(booking.status, "confirmed")
})

// ── Idempotency ──────────────────────────────────────────────────────────────

void test("sweep is idempotent — re-running over already-transitioned rows is a no-op", async () => {
  const booking = makeBooking({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
  })
  const { service } = await makeService([booking])
  const now = "2026-07-20T10:05:00+07:00"

  const first = await service.sweep(now)
  const second = await service.sweep(now)

  assert.equal(first.expired, 1)
  assert.equal(second.expired, 0)
  assert.equal(booking.status, "expired")
})

void test("sweep mixes independent rules across bookings in one pass", async () => {
  const expiring = makeBooking({
    bookingId: "b1",
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T09:00:00+07:00",
  })
  const confirming = makeBooking({
    bookingId: "b2",
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T09:00:00+07:00",
  })
  const completing = makeBooking({
    bookingId: "b3",
    status: "checked-in",
    endAt: "2026-07-20T09:00:00+07:00",
  })
  const untouched = makeBooking({ bookingId: "b4", status: "confirmed" })
  const { service } = await makeService([
    expiring,
    confirming,
    completing,
    untouched,
  ])

  const result = await service.sweep("2026-07-20T10:00:00+07:00")

  assert.equal(result.expired, 1)
  assert.equal(result.autoConfirmed, 1)
  assert.equal(result.completed, 1)
  assert.equal(expiring.status, "expired")
  assert.equal(confirming.status, "confirmed")
  assert.equal(completing.status, "completed")
  assert.equal(untouched.status, "confirmed")
})

// ── Config: BOOKING_CONFIRM_SLA_MINUTES (createHold → sweep, end to end) ────

void test("sweep respects a confirmDeadlineAt derived from a configured confirm SLA", async () => {
  // confirmPayment (bookings-service.test.ts) is what actually stamps
  // confirmDeadlineAt from BOOKING_CONFIRM_SLA_MINUTES; this pins that
  // whatever deadline lands on the doc, sweep only ever compares it to `now`.
  const booking = makeBooking({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: addMinutesToIso(vnNowIso(), 1),
  })
  const { service } = await makeService([booking])

  const notYet = await service.sweep(vnNowIso())
  assert.equal(notYet.autoConfirmed, 0)

  const after = await service.sweep(addMinutesToIso(vnNowIso(), 2))
  assert.equal(after.autoConfirmed, 1)
})
