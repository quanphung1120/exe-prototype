import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"

import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { vnNowIso } from "../src/shared/index.js"
import type {
  BookingRecordStatus,
  PaymentStatus,
  VenueCourt,
} from "../src/shared/index.js"

/**
 * Service-level tests for the Phase 3 player/venue-facing bookings API
 * (`BookingsController` → `BookingsService`): the server-side hold (replacing
 * the web's client-only `HOLD_MS`), the self-overlap hard block, the
 * cancellation refund policy, and the approve/decline/check-in/no-show
 * actions. Mongoose is mocked (no real DB) the same way `sessions-service.test.ts`
 * mocks `SessionsService`'s models — `connection.transaction` just runs its
 * callback inline, so the overlap-guarded write path exercises for real
 * without a live transactional deployment.
 */

// ── Chainable query mock ─────────────────────────────────────────────────────

/**
 * A stand-in for a Mongoose `Query` that's both directly awaitable
 * (`await model.findOne(...)`, like a real `Query`'s `.then`) *and* chainable
 * (`.select(...).lean()`, `.sort(...).lean()`) — real code in this feature
 * uses both patterns on the same model, sometimes in the same method.
 */
function makeQuery<T>(result: T) {
  const q = {
    select: () => q,
    sort: () => q,
    session: () => q,
    lean: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return q
}

interface FakeBookingDoc {
  bookingId: string
  venueId: string
  courtId: string
  courtName: string
  sport: string
  source: string
  userId?: string
  customer: { name: string; initials: string }
  startAt: string
  endAt: string
  dateKey: string
  start: string
  durationMin: number
  status: BookingRecordStatus
  paymentStatus: PaymentStatus
  price: number
  checkedInAt?: string
  declineReason?: string
  cancelReason?: string
  refund?: { pct: number; amount: number; at: string }
  statusHistory: { status: BookingRecordStatus; at: string }[]
  save: () => Promise<void>
}

/** A mutable "live" booking doc — `findOne` (direct-await) resolves to this
 * exact object, so a mutation `setStatus` makes is visible to every caller
 * that already holds a reference (mirroring one row in a real DB). */
function makeBookingDoc(
  overrides: Partial<FakeBookingDoc> = {}
): FakeBookingDoc {
  return {
    bookingId: "b1",
    venueId: "v9",
    courtId: "v9c1",
    courtName: "Sân 1",
    sport: "badminton",
    source: "app",
    userId: "user-1",
    customer: { name: "Khách Test", initials: "KT" },
    startAt: "2026-07-21T18:00:00+07:00",
    endAt: "2026-07-21T19:00:00+07:00",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
    status: "confirmed",
    paymentStatus: "paid",
    price: 200_000,
    statusHistory: [],
    save: () => Promise.resolve(),
    ...overrides,
  }
}

function makeVenueDoc(overrides: Record<string, unknown> = {}) {
  return {
    venueId: "v9",
    ownerId: "owner-1",
    info: { openFrom: "06:00", openTo: "23:00" },
    ops: {
      courts: [
        {
          id: "v9c1",
          name: "Sân 1",
          sport: "badminton",
          state: "available",
          pricePerHour: 200_000,
        },
      ],
      customers: [] as { id: string; userId?: string }[],
    },
    markModified: () => {},
    save: () => Promise.resolve(),
    ...overrides,
  }
}

interface Deps {
  bookingDoc?: FakeBookingDoc
  venueDoc?: ReturnType<typeof makeVenueDoc>
  ownBookings?: unknown[]
  overlapExisting?: unknown[]
  createdRecords?: unknown[]
  profile?: { user: { name: string; initials: string } }
  confirmSlaMinutes?: number
  /** Whether `bookingModel.exists({ venueId })` reports a booking already on file. */
  bookingsExist?: boolean
  /** What `bookingModel.findOneAndUpdate` resolves to — defaults to
   * `bookingDoc` (the update "succeeded"); pass `null` to simulate a
   * concurrent status transition making the filter no longer match. */
  findOneAndUpdateResult?: FakeBookingDoc | null
}

async function makeService(deps: Deps = {}) {
  const bookingDoc = deps.bookingDoc ?? makeBookingDoc()
  const venueDoc = deps.venueDoc ?? makeVenueDoc()
  const notifications: { userId: string; item: unknown }[] = []
  const created: unknown[] = []

  const findOneAndUpdateCalls: unknown[] = []
  const bookingModelMock = {
    findOne: () => makeQuery(bookingDoc),
    find: (filter: { dateKey?: string; venueId?: string }) =>
      makeQuery(
        filter.venueId !== undefined
          ? (deps.overlapExisting ?? [])
          : (deps.ownBookings ?? [])
      ),
    findOneAndUpdate: (filter: unknown) => {
      findOneAndUpdateCalls.push(filter)
      return makeQuery(
        deps.findOneAndUpdateResult === undefined
          ? bookingDoc
          : deps.findOneAndUpdateResult
      )
    },
    create: (records: unknown[]) => {
      created.push(...records)
      return Promise.resolve(
        records.map((r) => ({
          ...(r as object),
          save: () => Promise.resolve(),
        }))
      )
    },
    exists: () => Promise.resolve(deps.bookingsExist ?? false),
    insertMany: (records: unknown[]) => {
      created.push(...records)
      return Promise.resolve(records)
    },
  }
  const venueModelMock = {
    findOne: () => makeQuery(venueDoc),
  }
  const connectionMock = {
    transaction: (fn: (session?: unknown) => Promise<unknown>) => fn(undefined),
  }
  const profilesMock = {
    getProfile: () =>
      Promise.resolve(
        deps.profile ?? { user: { name: "Khách Test", initials: "KT" } }
      ),
  }
  const notificationsMock = {
    create: (userId: string, item: unknown) => {
      notifications.push({ userId, item })
      return Promise.resolve()
    },
  }

  const configMock = {
    get: (_key: string, fallback?: unknown) =>
      deps.confirmSlaMinutes ?? fallback,
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingsService,
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(BookingLock.name), useValue: {} },
      { provide: getModelToken(Venue.name), useValue: venueModelMock },
      { provide: getConnectionToken(), useValue: connectionMock },
      { provide: ProfileService, useValue: profilesMock },
      { provide: NotificationsService, useValue: notificationsMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile()

  return {
    service: moduleRef.get(BookingsService),
    bookingDoc,
    notifications,
    created,
    findOneAndUpdateCalls,
  }
}

// ── createHold ───────────────────────────────────────────────────────────────

void test("createHold creates an awaiting_payment booking with a 20-minute server hold", async () => {
  const { service, created } = await makeService({ overlapExisting: [] })
  const before = Date.now()

  const result = await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })

  assert.equal(result.status, "awaiting_payment")
  assert.equal(result.paymentStatus, "awaiting")
  assert.equal(result.venueId, "v9")
  assert.equal(result.price, 200_000)
  assert.ok(result.holdExpiresAt)
  const holdMs = new Date(result.holdExpiresAt).getTime()
  // ~20 minutes out (allow slack for test runtime).
  assert.ok(holdMs - before >= 19 * 60_000 && holdMs - before <= 21 * 60_000)
  assert.equal(created.length, 1)
})

void test("createHold adds the app booker to the venue's CRM customers once", async () => {
  const venueDoc = makeVenueDoc()
  const { service } = await makeService({
    venueDoc,
    overlapExisting: [],
    profile: { user: { name: "Nguyễn Văn A", initials: "NA" } },
  })

  await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })

  assert.equal(venueDoc.ops.customers.length, 1)
  assert.equal(venueDoc.ops.customers[0]?.id, "user-1")
})

void test("createHold does not duplicate an app booker already in the venue's CRM", async () => {
  const venueDoc = makeVenueDoc({
    ops: {
      ...makeVenueDoc().ops,
      customers: [{ id: "user-1", userId: "user-1" }],
    },
  })
  const { service } = await makeService({ venueDoc, overlapExisting: [] })

  await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })

  assert.equal(venueDoc.ops.customers.length, 1)
})

void test("createHold hard-blocks the user's own overlapping booking on another court", async () => {
  const { service } = await makeService({
    ownBookings: [
      {
        bookingId: "other",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
        status: "confirmed",
      },
    ],
  })

  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "18:30",
        durationMin: 60,
      }),
    ConflictException
  )
})

void test("createHold rejects a slot outside opening hours", async () => {
  const { service } = await makeService()
  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "23:30",
        durationMin: 60,
      }),
    BadRequestException
  )
})

void test("createHold rejects a slot overlapping a court block (decision #12)", async () => {
  const venueDoc = makeVenueDoc({
    ops: {
      ...makeVenueDoc().ops,
      blocks: [
        {
          id: "v9b1",
          courtId: "v9c1",
          dateKey: "2026-07-21",
          start: "17:30",
          durationMin: 90,
          reason: "maintenance",
        },
      ],
    },
  })
  const { service } = await makeService({ venueDoc, overlapExisting: [] })

  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
      }),
    ConflictException
  )
})

void test("createHold allows a slot that doesn't touch an unrelated block", async () => {
  const venueDoc = makeVenueDoc({
    ops: {
      ...makeVenueDoc().ops,
      blocks: [
        {
          id: "v9b1",
          courtId: "v9c1",
          dateKey: "2026-07-21",
          start: "06:00",
          durationMin: 60,
          reason: "break",
        },
      ],
    },
  })
  const { service, created } = await makeService({
    venueDoc,
    overlapExisting: [],
  })

  await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })
  assert.equal(created.length, 1)
})

void test("createHold rejects an archived court", async () => {
  const venueDoc = makeVenueDoc({
    ops: {
      ...makeVenueDoc().ops,
      courts: [
        {
          id: "v9c1",
          name: "Sân 1",
          sport: "badminton",
          state: "available",
          pricePerHour: 200_000,
          archived: true,
        },
      ],
    },
  })
  const { service } = await makeService({ venueDoc, overlapExisting: [] })

  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
      }),
    BadRequestException
  )
})

void test("createHold tolerates a persisted venue doc that predates ops.blocks", async () => {
  const venueDoc = makeVenueDoc() // no `blocks` key at all, like an old doc
  const { service, created } = await makeService({
    venueDoc,
    overlapExisting: [],
  })

  await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })
  assert.equal(created.length, 1)
})

void test("createHold 404s when the court doesn't resolve to a venue", async () => {
  const { service } = await makeService({
    venueDoc: makeVenueDoc({ ops: { courts: [] } }),
  })
  // findVenueByCourtId's own query is mocked to always return the venue doc's
  // venueId regardless of courtId, so drive the "no venue" branch by clearing
  // the venue's own catalog instead — findCourt then 404s the same class.
  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "does-not-exist",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
      }),
    NotFoundException
  )
})

// ── reschedule (atomic status re-check) ─────────────────────────────────────

void test("reschedule moves a reschedulable booking to the new slot", async () => {
  const bookingDoc = makeBookingDoc({ status: "confirmed" })
  const { service, findOneAndUpdateCalls } = await makeService({
    bookingDoc,
    overlapExisting: [],
  })

  const reservation = await service.reschedule("v9", "b1", {
    dayKey: "2026-07-22",
    start: "10:00",
    durationMin: 60,
  })

  assert.equal(reservation.id, "b1")
  assert.equal(findOneAndUpdateCalls.length, 1)
  const filter = findOneAndUpdateCalls[0] as {
    bookingId: string
    venueId: string
    status: { $in: string[] }
  }
  assert.equal(filter.bookingId, "b1")
  assert.equal(filter.venueId, "v9")
  assert.deepEqual(filter.status, {
    $in: ["pending", "confirmed", "checked-in"],
  })
})

void test("reschedule rejects with ConflictException when the status transitioned concurrently (fast-path gate)", async () => {
  const bookingDoc = makeBookingDoc({ status: "cancelled" })
  const { service } = await makeService({ bookingDoc })

  await assert.rejects(
    () =>
      service.reschedule("v9", "b1", {
        dayKey: "2026-07-22",
        start: "10:00",
        durationMin: 60,
      }),
    ConflictException
  )
})

void test("reschedule rejects with ConflictException (not NotFoundException) when the guarded findOneAndUpdate misses — a concurrent status transition after the lean read passed", async () => {
  const bookingDoc = makeBookingDoc({ status: "confirmed" })
  const { service, findOneAndUpdateCalls } = await makeService({
    bookingDoc,
    overlapExisting: [],
    // Simulates the sweeper/an operator action cancelling the booking
    // between the lean-read status gate and the guarded write.
    findOneAndUpdateResult: null,
  })

  await assert.rejects(
    () =>
      service.reschedule("v9", "b1", {
        dayKey: "2026-07-22",
        start: "10:00",
        durationMin: 60,
      }),
    ConflictException
  )
  assert.equal(findOneAndUpdateCalls.length, 1)
  const filter = findOneAndUpdateCalls[0] as {
    status: { $in: string[] }
  }
  assert.deepEqual(filter.status, {
    $in: ["pending", "confirmed", "checked-in"],
  })
})

// ── cancel (refund policy — decision #6) ────────────────────────────────────

void test("cancel refunds 100% at least 24h before the booking's start", async () => {
  const startAt = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      startAt,
      paymentStatus: "paid",
      price: 100_000,
    }),
  })

  const result = await service.cancel("user-1", "b1", "Đổi lịch")

  assert.equal(result.status, "cancelled")
  assert.equal(result.paymentStatus, "refunded")
  assert.equal(result.refund?.pct, 100)
  assert.equal(result.refund?.amount, 100_000)
  assert.equal(bookingDoc.cancelReason, "Đổi lịch")
})

void test("cancel refunds 50% inside the 24h window", async () => {
  const startAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      startAt,
      paymentStatus: "paid",
      price: 100_000,
    }),
  })

  const result = await service.cancel("user-1", "b1")

  assert.equal(result.paymentStatus, "partial_refund")
  assert.equal(result.refund?.pct, 50)
  assert.equal(result.refund?.amount, 50_000)
})

void test("cancel refunds 0% once the booking has started, keeping paymentStatus untouched", async () => {
  const startAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      startAt,
      paymentStatus: "paid",
      price: 100_000,
    }),
  })

  const result = await service.cancel("user-1", "b1")

  assert.equal(result.refund, undefined)
  assert.equal(result.paymentStatus, "paid")
  assert.equal(result.status, "cancelled")
})

void test("cancel rejects a booking that belongs to someone else", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({ userId: "someone-else" }),
  })
  await assert.rejects(() => service.cancel("user-1", "b1"), ForbiddenException)
})

void test("cancel never refunds an unpaid hold (nothing was charged)", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
      startAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }),
  })
  const result = await service.cancel("user-1", "b1")
  assert.equal(result.refund, undefined)
  assert.equal(result.paymentStatus, "awaiting")
})

// ── decide (venue approve/decline) ──────────────────────────────────────────

void test("decide approves a pending booking and notifies the player", async () => {
  const { service, notifications } = await makeService({
    bookingDoc: makeBookingDoc({ status: "pending" }),
  })

  const result = await service.decide("owner-1", "b1", "approve")

  assert.equal(result.status, "confirmed")
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.userId, "user-1")
})

void test("decide declines a pending booking with a flat 100% refund and required reason", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "pending",
      paymentStatus: "paid",
      price: 300_000,
      // Decline is a flat 100% regardless of how close the start time is.
      startAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  })

  const result = await service.decide("owner-1", "b1", "decline", "Hết sân")

  assert.equal(result.status, "cancelled")
  assert.equal(result.declineReason, "Hết sân")
  assert.equal(result.refund?.pct, 100)
  assert.equal(result.paymentStatus, "refunded")
  assert.equal(bookingDoc.declineReason, "Hết sân")
})

void test("decide rejects a caller who doesn't own the booking's venue", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({ status: "pending" }),
  })
  await assert.rejects(
    () => service.decide("not-the-owner", "b1", "approve"),
    ForbiddenException
  )
})

// ── updateStatus (venue-scoped reservation route) ────────────────────────────

void test("updateStatus refunds 100% when the venue cancels a paid booking (venue's fault, decision #6)", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "confirmed",
      paymentStatus: "paid",
      price: 200_000,
    }),
  })

  const { reservation } = await service.updateStatus(
    "v9",
    "b1",
    "cancelled",
    "Sự cố sân"
  )

  assert.equal(reservation.status, "cancelled")
  assert.equal(bookingDoc.paymentStatus, "refunded")
  assert.equal(bookingDoc.refund?.pct, 100)
  assert.equal(bookingDoc.refund?.amount, 200_000)
})

void test("updateStatus never refunds an unpaid hold cancelled by the venue", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
  })

  await service.updateStatus("v9", "b1", "cancelled", "Đóng sân")

  assert.equal(bookingDoc.refund, undefined)
  assert.equal(bookingDoc.paymentStatus, "awaiting")
})

// ── checkIn ──────────────────────────────────────────────────────────────────

void test("checkIn marks a confirmed booking checked-in", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({ status: "confirmed" }),
  })

  const result = await service.checkIn("owner-1", "b1")

  assert.equal(result.status, "checked-in")
  assert.ok(bookingDoc.checkedInAt)
})

// ── markNoShow ───────────────────────────────────────────────────────────────

void test("markNoShow rejects before the 30-minute grace window has passed", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "confirmed",
      startAt: vnNowIso(), // just started
    }),
  })
  await assert.rejects(
    () => service.markNoShow("owner-1", "b1"),
    BadRequestException
  )
})

void test("markNoShow rejects once the customer already checked in", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "confirmed",
      checkedInAt: vnNowIso(),
      startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }),
  })
  await assert.rejects(
    () => service.markNoShow("owner-1", "b1"),
    ConflictException
  )
})

void test("markNoShow succeeds ≥30 minutes after the start time and not checked in", async () => {
  const { service, notifications } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "confirmed",
      startAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    }),
  })

  const result = await service.markNoShow("owner-1", "b1")

  assert.equal(result.status, "no-show")
  assert.equal(notifications.length, 1)
})

// ── listMine ─────────────────────────────────────────────────────────────────

void test("listMine projects every persisted field the API contract promises", async () => {
  // `find({userId}).sort().lean()` — the booking model's `find` mock resolves
  // `ownBookings` for any filter with no `venueId` key (see `makeService`).
  const record = {
    bookingId: "b1",
    venueId: "v9",
    courtId: "v9c1",
    courtName: "Sân 1",
    sport: "badminton",
    source: "app",
    userId: "user-1",
    startAt: "2026-07-21T18:00:00+07:00",
    endAt: "2026-07-21T19:00:00+07:00",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
    price: 200_000,
    status: "confirmed",
    paymentStatus: "paid",
    customer: { name: "Khách", initials: "K" },
    statusHistory: [],
  }
  const { service } = await makeService({ ownBookings: [record] })
  const mine = await service.listMine("user-1")
  assert.equal(mine.length, 1)
  assert.equal(mine[0]?.bookingId, "b1")
  // The Reservation-only fields (customer, statusHistory) are dropped.
  assert.equal((mine[0] as Record<string, unknown>).customer, undefined)
})

// ── confirmPayment (Phase 5's SLA-clock wiring) ─────────────────────────────

void test("confirmPayment moves awaiting_payment to pending and stamps a confirmDeadlineAt from the default SLA", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
  })
  const before = Date.now()

  const doc = await service.confirmPayment("b1")

  assert.ok(doc)
  assert.equal(doc.status, "pending")
  assert.equal(doc.paymentStatus, "paid")
  assert.ok(bookingDoc.statusHistory.some((h) => h.status === "pending"))
  assert.ok(doc.confirmDeadlineAt)
  const deadlineMs = new Date(doc.confirmDeadlineAt).getTime()
  // Default SLA is 30 minutes when BOOKING_CONFIRM_SLA_MINUTES is unset.
  assert.ok(deadlineMs - before >= 29 * 60_000)
  assert.ok(deadlineMs - before <= 31 * 60_000)
})

void test("confirmPayment honors a configured BOOKING_CONFIRM_SLA_MINUTES", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
    confirmSlaMinutes: 5,
  })
  const before = Date.now()

  const doc = await service.confirmPayment("b1")

  assert.ok(doc?.confirmDeadlineAt)
  const deadlineMs = new Date(doc.confirmDeadlineAt).getTime()
  assert.ok(deadlineMs - before >= 4 * 60_000)
  assert.ok(deadlineMs - before <= 6 * 60_000)
})

void test("confirmPayment is a no-op past awaiting_payment (idempotent against IPN replay)", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({ status: "pending", paymentStatus: "paid" }),
  })
  const before = bookingDoc.statusHistory.length

  const doc = await service.confirmPayment("b1")

  assert.equal(doc?.status, "pending")
  assert.equal(bookingDoc.statusHistory.length, before)
})

void test("confirmPayment queues a full refund when payment lands after the hold expired (no money kept for a dead booking)", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "expired",
      paymentStatus: "awaiting",
      price: 200_000,
    }),
  })

  const doc = await service.confirmPayment("b1")

  assert.ok(doc)
  // Booking stays terminal — the slot is gone — but the money is refunded.
  assert.equal(doc.status, "expired")
  assert.equal(bookingDoc.paymentStatus, "refunded")
  assert.equal(bookingDoc.refund?.pct, 100)
  assert.equal(bookingDoc.refund?.amount, 200_000)
  // The player is told, not left in the dark.
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.userId, "user-1")
})

void test("confirmPayment doesn't double-refund a late payment on an already-refunded booking (IPN replay)", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "expired",
      paymentStatus: "refunded",
      refund: { pct: 100, amount: 200_000, at: vnNowIso() },
    }),
  })

  await service.confirmPayment("b1")

  assert.equal(bookingDoc.paymentStatus, "refunded")
  assert.equal(notifications.length, 0)
})

// ── seedHistoricalBookings (fresh venue onboarding demo history) ────────────

const SEED_COURTS: VenueCourt[] = [
  {
    id: "v9c1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Thảm",
    state: "available",
    utilToday: 0,
    pricePerHour: 200_000,
  },
  {
    id: "v9c2",
    name: "Sân 2",
    sport: "badminton",
    surface: "Thảm",
    state: "available",
    utilToday: 0,
    pricePerHour: 200_000,
  },
]

void test("seedHistoricalBookings backfills completed walk-in bookings for a bare venue", async () => {
  const { service, created } = await makeService({ bookingsExist: false })

  await service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  assert.ok(created.length > 0)
  for (const r of created as {
    venueId: string
    source: string
    status: string
    dateKey: string
    start: string
    durationMin: number
  }[]) {
    assert.equal(r.venueId, "v9")
    assert.equal(r.source, "walk-in")
    assert.equal(r.status, "completed")
    // Falls on or after 06:00 and fully within the 06:00–22:00 window.
    assert.ok(r.start >= "06:00")
    const [h, m] = r.start.split(":").map(Number)
    assert.ok(h * 60 + m + r.durationMin <= 22 * 60)
  }
})

void test("seedHistoricalBookings is a no-op when the venue already has any booking", async () => {
  const { service, created } = await makeService({ bookingsExist: true })

  await service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  assert.equal(created.length, 0)
})

void test("seedHistoricalBookings is a no-op for a venue with no courts yet", async () => {
  const { service, created } = await makeService({ bookingsExist: false })

  await service.seedHistoricalBookings("v9", [], "06:00", "22:00")

  assert.equal(created.length, 0)
})

void test("seedHistoricalBookings never double-books a court's overlapping slot", async () => {
  const { service, created } = await makeService({ bookingsExist: false })

  await service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  const byCourtDay = new Map<string, { start: string; durationMin: number }[]>()
  for (const r of created as {
    courtId: string
    dateKey: string
    start: string
    durationMin: number
  }[]) {
    const key = `${r.courtId}:${r.dateKey}`
    const list = byCourtDay.get(key) ?? []
    list.push({ start: r.start, durationMin: r.durationMin })
    byCourtDay.set(key, list)
  }
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number)
    return h * 60 + m
  }
  for (const slots of byCourtDay.values()) {
    const sorted = [...slots].sort((a, b) => toMin(a.start) - toMin(b.start))
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = toMin(sorted[i - 1].start) + sorted[i - 1].durationMin
      assert.ok(toMin(sorted[i].start) >= prevEnd)
    }
  }
})

void test("seedHistoricalBookings fills weekday evenings/weekends more than weekday mornings", async () => {
  const { service, created } = await makeService({ bookingsExist: false })

  await service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  let busyCount = 0
  let quietCount = 0
  for (const r of created as { dateKey: string; start: string }[]) {
    const weekday = new Date(`${r.dateKey}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
    const isWeekend = weekday === 0 || weekday === 6
    const isEvening = r.start >= "17:00" && r.start < "21:00"
    if (isWeekend || isEvening) busyCount++
    else quietCount++
  }
  assert.ok(busyCount > quietCount)
})

void test("seedHistoricalBookings upserts a synthetic CRM customer per unique booking phone", async () => {
  const venueDoc = makeVenueDoc()
  const { service } = await makeService({ bookingsExist: false, venueDoc })

  await service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  assert.ok(venueDoc.ops.customers.length > 0)
  const ids = venueDoc.ops.customers.map((c) => c.id)
  assert.equal(ids.length, new Set(ids).size) // no duplicate phone ids
})

void test("seedHistoricalBookings is deterministic for the same venue/courts", async () => {
  const a = await makeService({ bookingsExist: false })
  const b = await makeService({ bookingsExist: false })

  await a.service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")
  await b.service.seedHistoricalBookings("v9", SEED_COURTS, "06:00", "22:00")

  // bookingId (a fresh ObjectId) and statusHistory[].at (vnNowIso()) are the
  // only non-deterministic fields buildBookingRecord stamps on — every other
  // field must come out identical from the hashStr-driven pattern.
  const fingerprint = (records: unknown[]) =>
    (
      records as {
        courtId: string
        dateKey: string
        start: string
        durationMin: number
        price: number
        customer: { phone?: string }
      }[]
    ).map((r) => ({
      courtId: r.courtId,
      dateKey: r.dateKey,
      start: r.start,
      durationMin: r.durationMin,
      price: r.price,
      phone: r.customer.phone,
    }))

  assert.equal(a.created.length, b.created.length)
  assert.deepEqual(fingerprint(a.created), fingerprint(b.created))
})
