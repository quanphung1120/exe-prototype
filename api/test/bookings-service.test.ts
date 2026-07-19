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
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"

import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { vnNowIso } from "../src/shared/index.js"
import type { BookingRecordStatus, PaymentStatus } from "../src/shared/index.js"

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
  userId?: string
  startAt: string
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
    userId: "user-1",
    startAt: "2026-07-21T18:00:00+07:00",
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
}

async function makeService(deps: Deps = {}) {
  const bookingDoc = deps.bookingDoc ?? makeBookingDoc()
  const venueDoc = deps.venueDoc ?? makeVenueDoc()
  const notifications: { userId: string; item: unknown }[] = []
  const created: unknown[] = []

  const bookingModelMock = {
    findOne: () => makeQuery(bookingDoc),
    find: (filter: { dateKey?: string; venueId?: string }) =>
      makeQuery(
        filter.venueId !== undefined
          ? (deps.overlapExisting ?? [])
          : (deps.ownBookings ?? [])
      ),
    create: (records: unknown[]) => {
      created.push(...records)
      return Promise.resolve(
        records.map((r) => ({
          ...(r as object),
          save: () => Promise.resolve(),
        }))
      )
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
    addNotification: (userId: string, item: unknown) => {
      notifications.push({ userId, item })
      return Promise.resolve()
    },
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingsService,
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(BookingLock.name), useValue: {} },
      { provide: getModelToken(Venue.name), useValue: venueModelMock },
      { provide: getConnectionToken(), useValue: connectionMock },
      { provide: ProfileService, useValue: profilesMock },
    ],
  }).compile()

  return {
    service: moduleRef.get(BookingsService),
    bookingDoc,
    notifications,
    created,
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
