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

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { ConfigService } from "@nestjs/config"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"

import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { RoomShare } from "../src/features/rooms/room-share.schema.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { addMinutesToIso, vnNowIso } from "../src/shared/index.js"
import type {
  BookingCancelRequest,
  BookingRecordStatus,
  PaymentStatus,
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
  sessionId?: string
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
  refund?: {
    pct: number
    amount: number
    at: string
    status?: string
    ref?: string
  }
  cancelRequest?: BookingCancelRequest
  statusHistory: { status: BookingRecordStatus; at: string }[]
  save: () => Promise<void>
  markModified?: (path: string) => void
  set?: (path: string, value: unknown) => void
}

/** A mutable "live" booking doc — `findOne` (direct-await) resolves to this
 * exact object, so a mutation `setStatus` makes is visible to every caller
 * that already holds a reference (mirroring one row in a real DB). */
function makeBookingDoc(
  overrides: Partial<FakeBookingDoc> = {}
): FakeBookingDoc {
  const doc: FakeBookingDoc = {
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
    markModified: () => {},
    ...overrides,
  }
  // Dotted paths ("refund.status") reach into nested objects, like Mongoose.
  doc.set = (path, value) => {
    const keys = path.split(".")
    let target = doc as unknown as Record<string, unknown>
    for (const k of keys.slice(0, -1)) target = target[k] as typeof target
    target[keys[keys.length - 1]] = value
  }
  return doc
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

interface FakeShare {
  shareId: string
  roomId: string
  bookingId: string
  memberUserId: string
  amount: number
  status: "held" | "paid" | "refunded"
  bookingRefund?: number
  save: () => Promise<void>
}

function makeShare(overrides: Partial<FakeShare> = {}): FakeShare {
  return {
    shareId: "room-1:m1:0",
    roomId: "room-1",
    bookingId: "b1",
    memberUserId: "m1",
    amount: 100_000,
    status: "paid",
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
  directoryUser?: { id: string; name: string } | null
  directoryUsers?: { id: string; name: string }[]
  confirmSlaMinutes?: number
  /** Paid-booking cancel requests the player already made this month. */
  cancelsThisMonth?: number
  /** Cancelled bookings the late-refund upgrade scans (`status: "cancelled"` finds). */
  cancelledBookings?: unknown[]
  /** The room `RoomShare` rows. */
  shares?: FakeShare[]
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
  const bulkWrites: unknown[] = []

  const findOneAndUpdateCalls: unknown[] = []
  const walletCredits: { userId: string; amount: number; txId: string }[] = []
  const refundSettles: unknown[] = []
  const sessionUpdates: { filter: unknown; update: unknown }[] = []
  const roomEvents: string[] = []
  const bookingModelMock = {
    findOne: () => makeQuery(bookingDoc),
    countDocuments: () => Promise.resolve(deps.cancelsThisMonth ?? 0),
    find: (filter: { dateKey?: string; venueId?: string; status?: string }) =>
      makeQuery(
        filter.status === "cancelled"
          ? (deps.cancelledBookings ?? [])
          : filter.venueId !== undefined
            ? (deps.overlapExisting ?? [])
            : (deps.ownBookings ?? [])
      ),
    updateOne: (filter: unknown, update: unknown) => {
      refundSettles.push({ filter, update })
      return Promise.resolve({ modifiedCount: 1 })
    },
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
    bulkWrite: (writes: unknown[]) => {
      bulkWrites.push(...writes)
      return Promise.resolve({ modifiedCount: writes.length })
    },
  }
  const venueViolations = { count: 0 }
  const venueModelMock = {
    findOne: () => makeQuery(venueDoc),
    findOneAndUpdate: () => {
      venueViolations.count++
      return Promise.resolve({
        ownerId: "owner-1",
        cancelViolations: venueViolations.count,
      })
    },
  }
  const shares = deps.shares ?? []
  const shareMatches = (s: FakeShare, f: Record<string, unknown>) =>
    Object.entries(f).every(([k, v]) => {
      const actual = (s as unknown as Record<string, unknown>)[k]
      if (v && typeof v === "object" && "$in" in v) {
        return (v as { $in: unknown[] }).$in.includes(actual)
      }
      if (v && typeof v === "object" && "$exists" in v) {
        return (actual !== undefined) === (v as { $exists: boolean }).$exists
      }
      return actual === v
    })
  const shareModelMock = {
    find: (f: Record<string, unknown>) =>
      Promise.resolve(shares.filter((s) => shareMatches(s, f))),
  }
  const complaints: Record<string, unknown>[] = []
  const complaintModelMock = {
    exists: (f: Record<string, unknown>) =>
      Promise.resolve(
        complaints.find((c) => Object.entries(f).every(([k, v]) => c[k] === v))
          ? {}
          : null
      ),
    create: (doc: Record<string, unknown>) => {
      complaints.push(doc)
      return Promise.resolve(doc)
    },
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
  const clerkDirectoryMock = {
    getOne: () => Promise.resolve(deps.directoryUser ?? null),
    getMany: () => Promise.resolve(deps.directoryUsers ?? []),
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
      { provide: ClerkDirectoryService, useValue: clerkDirectoryMock },
      { provide: ConfigService, useValue: configMock },
      { provide: getModelToken(RoomShare.name), useValue: shareModelMock },
      {
        provide: getModelToken(RoomComplaint.name),
        useValue: complaintModelMock,
      },
      {
        provide: WalletService,
        useValue: {
          credit: (userId: string, amount: number, m: { txId: string }) => {
            walletCredits.push({ userId, amount, txId: m.txId })
            return Promise.resolve({ balance: amount, applied: true })
          },
        },
      },
      {
        provide: getModelToken(PlaySession.name),
        useValue: {
          updateOne: (filter: unknown, update: unknown) => {
            sessionUpdates.push({ filter, update })
            return Promise.resolve({ modifiedCount: 1 })
          },
        },
      },
      {
        provide: RoomEventsService,
        useValue: { emit: (id: string) => roomEvents.push(id) },
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(BookingsService),
    bookingDoc,
    notifications,
    created,
    findOneAndUpdateCalls,
    bulkWrites,
    sessionUpdates,
    roomEvents,
    walletCredits,
    refundSettles,
    shares,
    complaints,
    venueViolations,
  }
}

// ── createHold ───────────────────────────────────────────────────────────────

void test("listForVenue repairs old demo customer names before returning the approval queue", async () => {
  const record = makeBookingDoc({
    status: "pending",
    customer: { name: "Nguyễn Minh", initials: "NM" },
  })
  const { service, bulkWrites } = await makeService({
    overlapExisting: [record],
    directoryUsers: [{ id: "user-1", name: "Trần Gia Kiệt" }],
  })

  const reservations = await service.listForVenue("v9")

  assert.equal(reservations[0]?.customer.name, "Trần Gia Kiệt")
  assert.equal(reservations[0]?.customer.initials, "TK")
  assert.equal(bulkWrites.length, 1)
})

void test("createHold creates an awaiting_payment booking with a 20-minute server hold", async () => {
  const { service, created } = await makeService({ overlapExisting: [] })
  const before = Date.now()

  const result = await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2099-07-21",
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

void test("createHold uses the signed-in player's Clerk name instead of the seeded demo profile", async () => {
  const { service, created } = await makeService({
    overlapExisting: [],
    profile: { user: { name: "Nguyễn Minh", initials: "NM" } },
    directoryUser: { id: "user-1", name: "Trần Gia Kiệt" },
  })

  await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2099-07-21",
    start: "18:00",
    durationMin: 60,
  })

  const record = created[0] as FakeBookingDoc
  assert.deepEqual(record.customer, { name: "Trần Gia Kiệt", initials: "TK" })
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
    dateKey: "2099-07-21",
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
    dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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
          dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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
          dateKey: "2099-07-21",
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
    dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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
    dateKey: "2099-07-21",
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
        dateKey: "2099-07-21",
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

// ── cancel → a request the venue answers (docs/chinh-sach.md §2.4) ───────────

const HOUR = 60 * 60 * 1000
const startIn = (ms: number) => addMinutesToIso(vnNowIso(), ms / 60_000)

void test("cancel ≥24h before the start files an early request (venue has 12h, default 100%) and keeps the booking", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR), price: 100_000 }),
  })

  const result = await service.cancel("user-1", "b1", "Đổi lịch")

  assert.equal(result.status, "confirmed")
  assert.equal(result.refund, undefined)
  assert.equal(bookingDoc.cancelRequest?.window, "early")
  assert.equal(bookingDoc.cancelRequest?.defaultPct, 100)
  assert.equal(bookingDoc.cancelRequest?.reason, "Đổi lịch")
  const waitMs =
    new Date(bookingDoc.cancelRequest.deadlineAt).getTime() -
    new Date(bookingDoc.cancelRequest.requestedAt).getTime()
  assert.ok(Math.abs(waitMs - 12 * HOUR) < 60_000)
  assert.equal(notifications[0]?.userId, "owner-1")
})

void test("cancel <24h before the start files a late request (default 50%, answered before the start)", async () => {
  const startAt = startIn(90 * 60_000)
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({ startAt }),
  })

  await service.cancel("user-1", "b1")

  assert.equal(bookingDoc.cancelRequest?.window, "late")
  assert.equal(bookingDoc.cancelRequest?.defaultPct, 50)
  // 2h review window, capped at the start time (here 1.5h away).
  assert.ok(bookingDoc.cancelRequest.deadlineAt <= startAt)
})

void test("cancel is refused once the booking has started", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(-HOUR) }),
  })
  await assert.rejects(
    () => service.cancel("user-1", "b1"),
    BadRequestException
  )
  assert.equal(bookingDoc.status, "confirmed")
})

void test("cancel refuses a second request, and any request after the venue declined", async () => {
  const pending = makeBookingDoc({ startAt: startIn(30 * HOUR) })
  const first = await makeService({ bookingDoc: pending })
  await first.service.cancel("user-1", "b1")
  await assert.rejects(
    () => first.service.cancel("user-1", "b1"),
    ConflictException
  )

  const declined = makeBookingDoc({
    startAt: startIn(30 * HOUR),
    cancelRequest: {
      requestedAt: vnNowIso(),
      window: "early",
      deadlineAt: startIn(12 * HOUR),
      defaultPct: 100,
      declinedAt: vnNowIso(),
      declineReason: "Giải đấu",
    },
  })
  const second = await makeService({ bookingDoc: declined })
  await assert.rejects(
    () => second.service.cancel("user-1", "b1"),
    ConflictException
  )
})

void test("withdrawCancelRequest drops an unanswered request", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR) }),
  })
  await service.cancel("user-1", "b1")

  await service.withdrawCancelRequest("user-1", "b1")

  assert.equal(bookingDoc.cancelRequest, undefined)
  assert.equal(bookingDoc.status, "confirmed")
})

void test("decideCancelRequest approves an early request at 100% whatever refund the venue picked", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR), price: 100_000 }),
  })
  await service.cancel("user-1", "b1")

  const result = await service.decideCancelRequest(
    "owner-1",
    "b1",
    "approve",
    50
  )

  assert.equal(result.status, "cancelled")
  assert.equal(result.refund?.pct, 100)
  assert.equal(result.paymentStatus, "refunded")
  assert.equal(bookingDoc.cancelRequest?.refundPct, 100)
  assert.ok(bookingDoc.cancelRequest?.resolvedAt)
  assert.equal(notifications.at(-1)?.userId, "user-1")
})

void test("decideCancelRequest lets the venue choose 50% or 100% on a late request", async () => {
  const half = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(5 * HOUR), price: 100_000 }),
  })
  await half.service.cancel("user-1", "b1")
  const r50 = await half.service.decideCancelRequest("owner-1", "b1", "approve")
  assert.equal(r50.refund?.pct, 50)
  assert.equal(r50.paymentStatus, "partial_refund")

  const full = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(5 * HOUR), price: 100_000 }),
  })
  await full.service.cancel("user-1", "b1")
  const r100 = await full.service.decideCancelRequest(
    "owner-1",
    "b1",
    "approve",
    100
  )
  assert.equal(r100.refund?.pct, 100)
})

void test("decideCancelRequest decline keeps the booking live and tells the player why", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(5 * HOUR) }),
  })
  await service.cancel("user-1", "b1")

  const result = await service.decideCancelRequest(
    "owner-1",
    "b1",
    "decline",
    undefined,
    "Sân đã từ chối khách khác"
  )

  assert.equal(result.status, "confirmed")
  assert.equal(result.refund, undefined)
  assert.ok(bookingDoc.cancelRequest?.declinedAt)
  assert.equal(
    bookingDoc.cancelRequest?.declineReason,
    "Sân đã từ chối khách khác"
  )
  assert.equal(notifications.at(-1)?.userId, "user-1")
})

void test("an approved cancellation drops a still-open room back to 'no court booked' and announces it", async () => {
  const { service, sessionUpdates, roomEvents } = await makeService({
    bookingDoc: {
      ...makeBookingDoc({ startAt: startIn(30 * HOUR) }),
      sessionId: "room-7",
    } as FakeBookingDoc,
  })
  await service.cancel("user-1", "b1")

  await service.decideCancelRequest("owner-1", "b1", "approve")

  assert.equal(sessionUpdates.length, 1)
  assert.deepEqual(sessionUpdates[0]?.filter, {
    sessionId: "room-7",
    "data.reservationId": "b1",
    "data.listed": true,
  })
  assert.deepEqual(roomEvents, ["room-7"])
})

void test("decideCancelRequest rejects a caller who doesn't own the venue, and a request already answered", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR) }),
  })
  await service.cancel("user-1", "b1")
  await assert.rejects(
    () => service.decideCancelRequest("not-the-owner", "b1", "approve"),
    ForbiddenException
  )
  await service.decideCancelRequest("owner-1", "b1", "approve")
  await assert.rejects(
    () => service.decideCancelRequest("owner-1", "b1", "approve"),
    ConflictException
  )
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
  // Default SLA is 30 minutes when BOOKING_CONFIRM_SLA_MINUTES is unset; the
  // upper bound depends on opening hours (see approvalDeadlineIso tests).
  assert.ok(deadlineMs - before >= 29 * 60_000)
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

void test("confirmPayment repairs the customer name on an existing paid booking", async () => {
  const bookingDoc = makeBookingDoc({
    status: "pending",
    paymentStatus: "paid",
    customer: { name: "Nguyễn Minh", initials: "NM" },
  })
  let saves = 0
  bookingDoc.save = () => {
    saves++
    return Promise.resolve()
  }
  const { service } = await makeService({
    bookingDoc,
    directoryUser: { id: "user-1", name: "Trần Gia Kiệt" },
  })

  await service.confirmPayment("b1")

  assert.deepEqual(bookingDoc.customer, {
    name: "Trần Gia Kiệt",
    initials: "TK",
  })
  assert.equal(saves, 1)
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

// ── Refunds land in the wallet ───────────────────────────────────────────────

void test("an approved cancellation refunds the player's wallet and settles the refund", async () => {
  const { service, bookingDoc, walletCredits, refundSettles } =
    await makeService({
      bookingDoc: makeBookingDoc({
        startAt: startIn(30 * HOUR),
        price: 100_000,
      }),
    })
  await service.cancel("user-1", "b1")

  const result = await service.decideCancelRequest("owner-1", "b1", "approve")

  assert.deepEqual(walletCredits, [
    { userId: "user-1", amount: 100_000, txId: "refund-b1" },
  ])
  assert.equal(refundSettles.length, 1)
  assert.equal(bookingDoc.refund?.status, "settled")
  assert.equal(bookingDoc.refund?.ref, "wallet")
  assert.equal(result.refund?.status, "settled")
})

void test("a venue-fault cancel refunds 100% into the wallet", async () => {
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({ status: "pending", price: 150_000 }),
  })

  await service.updateStatus("v9", "b1", "cancelled", "Sân hỏng")

  assert.deepEqual(walletCredits, [
    { userId: "user-1", amount: 150_000, txId: "refund-b1" },
  ])
})

void test("a booking with no player account keeps its refund on the manual queue", async () => {
  const { service, walletCredits, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "pending",
      userId: undefined,
      source: "walk-in",
    }),
  })

  await service.updateStatus("v9", "b1", "cancelled")

  assert.deepEqual(walletCredits, [])
  assert.equal(bookingDoc.refund?.status, "manual")
})

// ── Room shares follow the booking's refund ──────────────────────────────────

const credits = (
  list: { userId: string; amount: number; txId: string }[]
): Record<string, number> =>
  Object.fromEntries(list.map((c) => [c.userId, c.amount]))

void test("a venue cancel refunds room members their paid shares out of the host's refund", async () => {
  const { service, walletCredits, shares } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "pending",
      price: 400_000,
      sessionId: "room-1",
    }),
    shares: [
      makeShare({ shareId: "s1", memberUserId: "m1" }),
      makeShare({ shareId: "s2", memberUserId: "m2" }),
      makeShare({ shareId: "s3", memberUserId: "m3", status: "held" }),
    ],
  })

  await service.updateStatus("v9", "b1", "cancelled", "Sân hỏng")

  // Members get 100% of their shares; the host gets the rest of the 400k.
  assert.deepEqual(credits(walletCredits), {
    m1: 100_000,
    m2: 100_000,
    m3: 100_000,
    "user-1": 200_000,
  })
  assert.deepEqual(
    shares.map((s) => [s.status, s.bookingRefund]),
    [
      ["refunded", 100_000],
      ["refunded", 100_000],
      ["refunded", undefined],
    ]
  )
})

void test("a 50% late cancel refunds members 50% of their shares, funded by the host's refund", async () => {
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({
      startAt: startIn(5 * HOUR),
      price: 400_000,
      sessionId: "room-1",
    }),
    shares: [
      makeShare({ shareId: "s1", memberUserId: "m1" }),
      makeShare({ shareId: "s2", memberUserId: "m2" }),
    ],
  })
  await service.cancel("user-1", "b1")

  await service.decideCancelRequest("owner-1", "b1", "approve")

  // 50% of 400k = 200k refund: 50k to each member, the other 100k to the host.
  assert.deepEqual(credits(walletCredits), {
    m1: 50_000,
    m2: 50_000,
    "user-1": 100_000,
  })
})

void test("a cancelled booking with no room moves only the host's refund", async () => {
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({ status: "pending", price: 150_000 }),
  })

  await service.updateStatus("v9", "b1", "cancelled", "Sân hỏng")

  assert.deepEqual(credits(walletCredits), { "user-1": 150_000 })
})

// ── Cancel cap ───────────────────────────────────────────────────────────────

void test("a player can ask to cancel at most 3 paid bookings a month", async () => {
  const blocked = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR) }),
    cancelsThisMonth: 3,
  })
  await assert.rejects(
    () => blocked.service.cancel("user-1", "b1"),
    /3 lượt huỷ/
  )
  assert.equal(blocked.bookingDoc.cancelRequest, undefined)

  const allowed = await makeService({
    bookingDoc: makeBookingDoc({ startAt: startIn(30 * HOUR) }),
    cancelsThisMonth: 2,
  })
  await allowed.service.cancel("user-1", "b1")
  assert.ok(allowed.bookingDoc.cancelRequest)
})

void test("cancelling an unpaid hold never counts against the monthly cap", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
    cancelsThisMonth: 3,
  })

  const result = await service.cancel("user-1", "b1")

  assert.equal(result.status, "cancelled")
})

// ── A re-sold slot lifts the late-cancel refund to 100% ──────────────────────

function lateCancelled(overrides: Record<string, unknown> = {}) {
  const old = {
    bookingId: "old-1",
    venueId: "v9",
    courtId: "v9c1",
    courtName: "Sân 1",
    userId: "user-9",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
    startAt: "2099-07-21T18:00:00+07:00",
    status: "cancelled",
    price: 200_000,
    refund: {
      pct: 50,
      amount: 100_000,
      at: "2026-07-20T10:00:00+07:00",
      status: "settled",
    } as Record<string, unknown>,
    cancelRequest: { window: "late" },
    markModified: () => {},
    save: () => Promise.resolve(),
    ...overrides,
  }
  return old
}

void test("a new paid booking on a late-cancelled slot lifts that refund to 100%", async () => {
  const old = lateCancelled()
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
    cancelledBookings: [old],
  })

  await service.confirmPayment("b1")

  assert.deepEqual(
    walletCredits.filter((c) => c.userId === "user-9"),
    [{ userId: "user-9", amount: 100_000, txId: "refund-topup-old-1" }]
  )
  assert.equal(old.refund.pct, 100)
  assert.equal(old.refund.amount, 200_000)
  assert.equal(old.refund.upgradedBy, "b1")
})

void test("the upgrade also tops up room members, and leaves the host only the remainder", async () => {
  const old = lateCancelled({
    sessionId: "room-1",
    price: 400_000,
    refund: {
      pct: 50,
      amount: 200_000,
      at: "2026-07-20T10:00:00+07:00",
      status: "settled",
    },
  })
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
    cancelledBookings: [old],
    shares: [
      makeShare({
        shareId: "s1",
        bookingId: "old-1",
        status: "refunded",
        bookingRefund: 50_000,
      }),
    ],
  })

  await service.confirmPayment("b1")

  // Member: 100k share − 50k already refunded = 50k more. Host: 200k − 50k.
  assert.deepEqual(
    credits(walletCredits.filter((c) => c.userId !== "user-1")),
    { m1: 50_000, "user-9": 150_000 }
  )
})

void test("the upgrade ignores other courts' times, non-overlapping slots and early cancels' full refunds", async () => {
  const apart = lateCancelled({
    start: "20:00",
    startAt: "2099-07-21T20:00:00+07:00",
  })
  const { service, walletCredits } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "awaiting_payment",
      paymentStatus: "awaiting",
    }),
    cancelledBookings: [apart],
  })

  await service.confirmPayment("b1")

  assert.deepEqual(walletCredits, [])
  assert.equal(apart.refund.pct, 50)
})

// ── Complaints about a refused early cancel ──────────────────────────────────

function declinedEarly(overrides: Record<string, unknown> = {}) {
  return makeBookingDoc({
    startAt: startIn(30 * HOUR),
    cancelRequest: {
      requestedAt: "2026-07-20T10:00:00+07:00",
      window: "early",
      deadlineAt: "2026-07-20T22:00:00+07:00",
      defaultPct: 100,
      declinedAt: "2026-07-20T12:00:00+07:00",
      declineReason: "Không có lý do",
    },
    ...overrides,
  })
}

void test("a player can complain when a venue refuses an early cancel", async () => {
  const { service, complaints, notifications } = await makeService({
    bookingDoc: declinedEarly(),
  })

  await service.fileCancelComplaint("user-1", "b1", "Sân từ chối vô lý")

  assert.equal(complaints.length, 1)
  assert.equal(complaints[0]?.kind, "cancel_decline")
  assert.equal(complaints[0]?.status, "open")
  assert.equal(complaints[0]?.memberUserId, "user-1")
  assert.equal(notifications.at(-1)?.userId, "owner-1")
})

void test("a cancel complaint needs an early, declined request — one open per booking, owner only", async () => {
  const late = await makeService({
    bookingDoc: declinedEarly({
      cancelRequest: {
        requestedAt: "x",
        window: "late",
        deadlineAt: "x",
        defaultPct: 50,
        declinedAt: "y",
      },
    }),
  })
  await assert.rejects(
    () => late.service.fileCancelComplaint("user-1", "b1", "Lý do dài đủ"),
    ConflictException
  )

  const open = await makeService({ bookingDoc: makeBookingDoc() })
  await assert.rejects(
    () => open.service.fileCancelComplaint("user-1", "b1", "Lý do dài đủ"),
    ConflictException
  )

  const twice = await makeService({ bookingDoc: declinedEarly() })
  await twice.service.fileCancelComplaint("user-1", "b1", "Lý do dài đủ")
  await assert.rejects(
    () => twice.service.fileCancelComplaint("user-1", "b1", "Lý do dài đủ"),
    /đã gửi khiếu nại/
  )

  const stranger = await makeService({ bookingDoc: declinedEarly() })
  await assert.rejects(
    () => stranger.service.fileCancelComplaint("user-2", "b1", "Lý do dài đủ"),
    ForbiddenException
  )
})

void test("overturning a refused cancel refunds 100% and counts a venue violation", async () => {
  const { service, bookingDoc, walletCredits, venueViolations, notifications } =
    await makeService({ bookingDoc: declinedEarly({ price: 200_000 }) })

  const violations = await service.refundDeclinedCancel("b1")

  assert.equal(violations, 1)
  assert.equal(venueViolations.count, 1)
  assert.equal(bookingDoc.status, "cancelled")
  assert.equal(bookingDoc.cancelRequest?.byAdmin, true)
  assert.deepEqual(credits(walletCredits), { "user-1": 200_000 })
  assert.match(
    (notifications.at(-1)?.item as { text: string }).text,
    /Cảnh cáo/
  )
})
