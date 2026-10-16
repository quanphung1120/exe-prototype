import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { SessionEventsService } from "../src/features/sessions/session-events.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { ConfigService } from "@nestjs/config"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"

import { BookingChatService } from "../src/features/bookings/booking-chat.service.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import type { BookingRecordStatus, PaymentStatus } from "../src/shared/index.js"

/**
 * `BookingsService.sweep` is the whole clock-driven state machine
 * `payments/bookings-sweeper.service.ts` (the cron trigger) calls every
 * minute. These tests run it against a mocked Mongoose model — same approach
 * as `bookings-service.test.ts` — so each rule's guard, idempotency and
 * notification is pinned without a real DB. The one thing the sweeper must
 * NEVER do is confirm a booking: only a person who has seen the money can.
 */

interface FakeBooking {
  bookingId: string
  venueId: string
  userId?: string
  status: BookingRecordStatus
  paymentStatus?: PaymentStatus
  paymentMethod?: string
  holdExpiresAt?: string
  confirmDeadlineAt?: string
  confirmReminderAt?: string
  proofSubmittedAt?: string
  endAt?: string
  startAt?: string
  courtName: string
  start: string
  dateKey: string
  customer: { name: string; initials: string }
  price: number
  amountDue?: number
  declineReason?: string
  rejectReason?: string
  refund?: unknown
  markModified?: (path: string) => void
  statusHistory: { status: BookingRecordStatus; at: string }[]
  save: () => Promise<void>
}

function makeBooking(overrides: Partial<FakeBooking> = {}): FakeBooking {
  return {
    bookingId: "b1",
    venueId: "v1",
    userId: "user-1",
    status: "awaiting_venue_confirmation",
    paymentStatus: "awaiting_verification",
    paymentMethod: "vietqr",
    courtName: "Sân 1",
    start: "18:00",
    dateKey: "2026-07-21",
    customer: { name: "Khách Test", initials: "KT" },
    price: 200_000,
    amountDue: 200_000,
    statusHistory: [],
    markModified: () => {},
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

type Cmp = { $lte?: string; $gt?: string; $exists?: boolean }

/**
 * One in-memory set of "live" booking docs (mutated in place by `setStatus`,
 * so assertions after `sweep` read straight off the input array) — `find`
 * answers `sweep`'s queries by filtering on the same fields the real Mongoose
 * query does.
 */
async function makeService(bookings: FakeBooking[]) {
  const notifications: { userId: string; item: { id: string } }[] = []

  const matches = (b: FakeBooking, filter: Record<string, unknown>) => {
    const status = filter.status as
      BookingRecordStatus | { $in: BookingRecordStatus[] } | undefined
    if (typeof status === "object") {
      if (!status.$in.includes(b.status)) return false
    } else if (status !== undefined && b.status !== status) return false
    const deadline = filter.confirmDeadlineAt as Cmp | undefined
    if (
      deadline?.$lte &&
      !(b.confirmDeadlineAt && b.confirmDeadlineAt <= deadline.$lte)
    )
      return false
    if (
      deadline?.$gt &&
      !(b.confirmDeadlineAt && b.confirmDeadlineAt > deadline.$gt)
    )
      return false
    const reminder = filter.confirmReminderAt as Cmp | undefined
    if (reminder?.$exists === false && b.confirmReminderAt) return false
    const endAt = filter.endAt as Cmp | undefined
    if (endAt?.$lte && !(b.endAt && b.endAt <= endAt.$lte)) return false
    return true
  }

  const bookingModelMock = {
    find: (filter: Record<string, unknown>) =>
      makeQuery(bookings.filter((b) => matches(b, filter))),
    findOne: (filter: { bookingId: string; venueId?: string }) =>
      makeQuery(
        bookings.find(
          (b) =>
            b.bookingId === filter.bookingId &&
            (filter.venueId === undefined || b.venueId === filter.venueId)
        ) ?? null
      ),
    findOneAndUpdate: (
      filter: Record<string, unknown> & { bookingId: string },
      update: { $set: Record<string, unknown> }
    ) => {
      const doc = bookings.find(
        (b) => b.bookingId === filter.bookingId && matches(b, filter)
      )
      if (doc) Object.assign(doc, update.$set)
      return makeQuery(doc ?? null)
    },
  }
  const notificationsMock = {
    create: (userId: string, item: { id: string }) => {
      notifications.push({ userId, item })
      return Promise.resolve()
    },
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingsService,
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(BookingLock.name), useValue: {} },
      {
        provide: getModelToken(Venue.name),
        useValue: { findOne: () => makeQuery({ ownerId: "owner-1" }) },
      },
      {
        provide: getConnectionToken(),
        useValue: {
          transaction: (fn: (s?: unknown) => Promise<unknown>) => fn(undefined),
        },
      },
      { provide: ProfileService, useValue: {} },
      { provide: NotificationsService, useValue: notificationsMock },
      {
        provide: ClerkDirectoryService,
        useValue: { getOne: () => Promise.resolve(null) },
      },
      {
        provide: ConfigService,
        useValue: { get: (_key: string, fallback?: unknown) => fallback },
      },
      { provide: getModelToken(RoomComplaint.name), useValue: {} },
      {
        provide: getModelToken(PlaySession.name),
        useValue: { updateOne: () => Promise.resolve({ modifiedCount: 0 }) },
      },
      { provide: RoomEventsService, useValue: { emit: () => {} } },
      { provide: SessionEventsService, useValue: { emit: () => {} } },
      { provide: BookingChatService, useValue: { post: () => Promise.resolve() } },
    ],
  }).compile()

  return { service: moduleRef.get(BookingsService), notifications }
}

// ── completing ──────────────────────────────────────────────────────────────

void test("sweep completes a confirmed booking once it has ended, and not before", async () => {
  const booking = makeBooking({
    status: "confirmed",
    paymentStatus: "paid",
    endAt: "2026-07-21T19:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const early = await service.sweep("2026-07-21T18:59:59+07:00")
  assert.equal(early.completed, 0)
  assert.equal(booking.status, "confirmed")

  const done = await service.sweep("2026-07-21T19:00:01+07:00")
  assert.equal(done.completed, 1)
  assert.equal(booking.status, "completed")
})

// ── unanswered transfers ────────────────────────────────────────────────────

void test("sweep rejects a transfer the venue never answered and queues the refund", async () => {
  const booking = makeBooking({
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
  })
  const { service, notifications } = await makeService([booking])

  const result = await service.sweep("2026-07-20T10:00:01+07:00")

  assert.equal(result.overdueRejected, 1)
  assert.equal(booking.status, "rejected_refund_pending")
  assert.match(booking.rejectReason ?? "", /không phản hồi/)
  const refund = booking.refund as {
    pct: number
    amount: number
    status: string
  }
  assert.equal(refund.pct, 100)
  assert.equal(refund.amount, 200_000)
  assert.equal(refund.status, "manual")
  // Both sides hear about it: the player (to chase) and the venue (to refund).
  assert.deepEqual(notifications.map((n) => n.userId).sort(), [
    "owner-1",
    "user-1",
  ])
})

void test("sweep leaves a transfer alone until its deadline, and never confirms it", async () => {
  const booking = makeBooking({
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
  })
  const { service } = await makeService([booking])

  const result = await service.sweep("2026-07-20T09:59:59+07:00")

  assert.equal(result.overdueRejected, 0)
  assert.equal(booking.status, "awaiting_venue_confirmation")
})

void test("sweep is idempotent: a rejected transfer is not rejected again", async () => {
  const booking = makeBooking({
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
  })
  const { service, notifications } = await makeService([booking])

  await service.sweep("2026-07-20T10:05:00+07:00")
  const again = await service.sweep("2026-07-20T10:06:00+07:00")

  assert.equal(again.overdueRejected, 0)
  assert.equal(notifications.length, 2)
})

void test("silence never confirms: legacy pending bookings and unpaid ones stay as they are", async () => {
  const legacy = makeBooking({
    bookingId: "legacy",
    status: "pending",
    paymentStatus: "paid",
    paymentMethod: "sepay",
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
  })
  const unpaid = makeBooking({
    bookingId: "unpaid",
    status: "awaiting_payment",
    paymentStatus: "awaiting",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
  })
  const { service } = await makeService([legacy, unpaid])

  const result = await service.sweep("2026-07-25T10:00:00+07:00")

  assert.deepEqual(result, { completed: 0, overdueRejected: 0, reminded: 0 })
  assert.equal(legacy.status, "pending")
  assert.equal(unpaid.status, "awaiting_payment")
})

// ── reminders ───────────────────────────────────────────────────────────────

void test("sweep reminds the venue once, halfway through its answer window", async () => {
  const booking = makeBooking({
    proofSubmittedAt: "2026-07-20T08:00:00+07:00",
    confirmDeadlineAt: "2026-07-20T20:00:00+07:00",
  })
  const { service, notifications } = await makeService([booking])

  const early = await service.sweep("2026-07-20T13:59:00+07:00")
  assert.equal(early.reminded, 0)

  const halfway = await service.sweep("2026-07-20T14:00:00+07:00")
  assert.equal(halfway.reminded, 1)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.userId, "owner-1")
  assert.ok(booking.confirmReminderAt)

  const later = await service.sweep("2026-07-20T15:00:00+07:00")
  assert.equal(later.reminded, 0)
  assert.equal(notifications.length, 1)
})
