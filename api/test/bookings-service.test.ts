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

import { BookingChatService } from "../src/features/bookings/booking-chat.service.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"
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
  paymentMethod?: string
  amountDue?: number
  transferMemo?: string
  paymentProofUrl?: string
  proofSubmittedAt?: string
  confirmDeadlineAt?: string
  rejectReason?: string
  refundAccount?: unknown
  refundProofUrl?: string
  refundConfirmation?: { result: string; at: string }
  refund?: {
    pct: number
    amount: number
    at: string
    status?: string
    ref?: string
    proofUrl?: string
  }
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

interface Deps {
  bookingDoc?: FakeBookingDoc
  venueDoc?: ReturnType<typeof makeVenueDoc>
  ownBookings?: unknown[]
  overlapExisting?: unknown[]
  createdRecords?: unknown[]
  profile?: { user: { name: string; initials: string } }
  directoryUser?: { id: string; name: string } | null
  directoryUsers?: { id: string; name: string }[]
  /** Unpaid (`awaiting_payment`) bookings the player already has open. */
  unpaidBookings?: number
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
  const sessionUpdates: { filter: unknown; update: unknown }[] = []
  const chatPosts: { bookingId: string; event: string }[] = []
  const roomEvents: string[] = []
  const bookingModelMock = {
    findOne: () => makeQuery(bookingDoc),
    countDocuments: () => Promise.resolve(deps.unpaidBookings ?? 0),
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
    bulkWrite: (writes: unknown[]) => {
      bulkWrites.push(...writes)
      return Promise.resolve({ modifiedCount: writes.length })
    },
  }
  const venueModelMock = {
    findOne: () => makeQuery(venueDoc),
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
    get: (_key: string, fallback?: unknown) => fallback,
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
      {
        provide: getModelToken(RoomComplaint.name),
        useValue: complaintModelMock,
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
      {
        provide: BookingChatService,
        useValue: {
          post: (booking: { bookingId: string }, event: string) => {
            chatPosts.push({ bookingId: booking.bookingId, event })
            return Promise.resolve()
          },
        },
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(BookingsService),
    chatPosts,
    bookingDoc,
    notifications,
    created,
    findOneAndUpdateCalls,
    bulkWrites,
    sessionUpdates,
    roomEvents,
    complaints,
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
    $in: ["awaiting_venue_confirmation", "pending", "confirmed", "checked-in"],
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
    $in: ["awaiting_venue_confirmation", "pending", "confirmed", "checked-in"],
  })
})

// ── cancel ───────────────────────────────────────────────────────────────────

void test("cancel rejects a booking that belongs to someone else", async () => {
  const { service } = await makeService({
    bookingDoc: makeBookingDoc({ userId: "someone-else" }),
  })
  await assert.rejects(() => service.cancel("user-1", "b1"), ForbiddenException)
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

// ── VietQR flow (plan 025) ───────────────────────────────────────────────────

const REFUND_ACCOUNT = {
  bankBin: "970422",
  bankCode: "MB",
  bankName: "MBBank",
  accountNo: "0123456789",
  accountName: "NGUYEN VAN A",
}
const PROOF_URL = "https://res.cloudinary.com/demo/image/upload/proof.png"
const inHours = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString()

/** A booking whose player has not yet sent the transfer screenshot. */
const unpaidDoc = (overrides: Partial<FakeBookingDoc> = {}) =>
  makeBookingDoc({
    status: "awaiting_payment",
    paymentStatus: "awaiting",
    paymentMethod: "vietqr",
    transferMemo: "SHTABC234",
    amountDue: 180_000,
    startAt: inHours(48),
    ...overrides,
  })

/** A booking waiting for the venue to check its bank app. */
const waitingDoc = (overrides: Partial<FakeBookingDoc> = {}) =>
  unpaidDoc({
    status: "awaiting_venue_confirmation",
    paymentStatus: "awaiting_verification",
    paymentProofUrl: PROOF_URL,
    refundAccount: REFUND_ACCOUNT,
    ...overrides,
  })

const HOLD_INPUT = {
  courtId: "v9c1",
  dateKey: "2099-07-21",
  start: "18:00",
  durationMin: 60,
}

void test("createHold makes an unpaid VietQR booking with no hold and no expiry", async () => {
  const { service, created } = await makeService({ overlapExisting: [] })

  const result = await service.createHold("user-1", HOLD_INPUT)

  assert.equal(result.status, "awaiting_payment")
  assert.equal(result.paymentStatus, "awaiting")
  assert.equal(result.paymentMethod, "vietqr")
  assert.equal(result.holdExpiresAt, undefined)
  assert.equal(result.price, 200_000)
  assert.equal(created.length, 1)
})

void test("createHold lets several players queue for a slot, but not one a confirmed booking holds", async () => {
  const slot = {
    bookingId: "other",
    courtId: "v9c1",
    dateKey: "2099-07-21",
    start: "18:00",
    durationMin: 60,
  }
  const queued = await makeService({
    overlapExisting: [{ ...slot, status: "awaiting_venue_confirmation" }],
  })
  await queued.service.createHold("user-1", HOLD_INPUT)
  assert.equal(queued.created.length, 1)

  const taken = await makeService({
    overlapExisting: [{ ...slot, status: "confirmed" }],
  })
  await assert.rejects(
    () => taken.service.createHold("user-1", HOLD_INPUT),
    ConflictException
  )
})

void test("createHold caps how many unpaid bookings one player keeps open", async () => {
  const { service } = await makeService({ unpaidBookings: 5 })
  await assert.rejects(
    () => service.createHold("user-1", HOLD_INPUT),
    /chưa gửi ảnh chuyển khoản/
  )
})

void test("submitPaymentProof queues the booking for the venue with a 12-hour answer deadline", async () => {
  const { service, bookingDoc, notifications, chatPosts } = await makeService({
    bookingDoc: unpaidDoc(),
  })

  const result = await service.submitPaymentProof("user-1", "b1", {
    proofUrl: PROOF_URL,
    refundAccount: REFUND_ACCOUNT,
  })

  assert.equal(result.status, "awaiting_venue_confirmation")
  assert.equal(result.paymentStatus, "awaiting_verification")
  assert.equal(bookingDoc.paymentProofUrl, PROOF_URL)
  assert.deepEqual(bookingDoc.refundAccount, REFUND_ACCOUNT)
  const hours =
    (new Date(result.confirmDeadlineAt ?? "").getTime() -
      new Date(bookingDoc.proofSubmittedAt ?? "").getTime()) /
    3_600_000
  assert.ok(Math.abs(hours - 12) < 0.01)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.userId, "owner-1")
  assert.deepEqual(chatPosts, [{ bookingId: "b1", event: "proof" }])
})

void test("the answer deadline never falls after the slot starts", async () => {
  const startAt = inHours(2)
  const { service } = await makeService({ bookingDoc: unpaidDoc({ startAt }) })
  const result = await service.submitPaymentProof("user-1", "b1", {
    proofUrl: PROOF_URL,
    refundAccount: REFUND_ACCOUNT,
  })
  assert.equal(result.confirmDeadlineAt, startAt)
})

void test("submitPaymentProof is idempotent and tells the venue only once", async () => {
  const { service, notifications, chatPosts } = await makeService({
    bookingDoc: unpaidDoc(),
  })
  const input = { proofUrl: PROOF_URL, refundAccount: REFUND_ACCOUNT }
  await service.submitPaymentProof("user-1", "b1", input)
  const again = await service.submitPaymentProof("user-1", "b1", input)
  assert.equal(again.status, "awaiting_venue_confirmation")
  assert.equal(notifications.length, 1)
  assert.equal(chatPosts.length, 1)
})

void test("submitPaymentProof refuses another player's booking, a wrong status and a missing memo", async () => {
  const input = { proofUrl: PROOF_URL, refundAccount: REFUND_ACCOUNT }
  const other = await makeService({ bookingDoc: unpaidDoc({ userId: "x" }) })
  await assert.rejects(
    () => other.service.submitPaymentProof("user-1", "b1", input),
    ForbiddenException
  )
  const confirmed = await makeService({ bookingDoc: makeBookingDoc() })
  await assert.rejects(
    () => confirmed.service.submitPaymentProof("user-1", "b1", input),
    ConflictException
  )
  const noMemo = await makeService({
    bookingDoc: unpaidDoc({ transferMemo: undefined }),
  })
  await assert.rejects(
    () => noMemo.service.submitPaymentProof("user-1", "b1", input),
    /mã chuyển khoản/
  )
})

void test("decide approve confirms the booking and marks the money as received", async () => {
  const { service, notifications, chatPosts } = await makeService({
    bookingDoc: waitingDoc(),
  })

  const result = await service.decide("owner-1", "b1", "approve")

  assert.equal(result.status, "confirmed")
  assert.equal(result.paymentStatus, "paid")
  assert.equal(notifications[0]?.userId, "user-1")
  assert.deepEqual(chatPosts, [{ bookingId: "b1", event: "approved" }])
})

void test("decide approve fails when another booking already holds the slot", async () => {
  const doc = waitingDoc()
  const { service } = await makeService({
    bookingDoc: doc,
    overlapExisting: [
      {
        bookingId: "other",
        courtId: doc.courtId,
        dateKey: doc.dateKey,
        start: doc.start,
        durationMin: doc.durationMin,
        status: "confirmed",
      },
    ],
  })
  await assert.rejects(
    () => service.decide("owner-1", "b1", "approve"),
    /đã có lượt đặt được duyệt/
  )
})

void test("decide decline needs a reason and queues a full refund", async () => {
  const noReason = await makeService({ bookingDoc: waitingDoc() })
  await assert.rejects(
    () => noReason.service.decide("owner-1", "b1", "decline"),
    BadRequestException
  )

  const { service, bookingDoc, chatPosts } = await makeService({
    bookingDoc: waitingDoc(),
  })
  const result = await service.decide("owner-1", "b1", "decline", "Hết sân")
  assert.deepEqual(chatPosts, [{ bookingId: "b1", event: "rejected" }])
  assert.equal(result.status, "rejected_refund_pending")
  assert.equal(result.declineReason, "Hết sân")
  assert.equal(result.refund?.pct, 100)
  assert.equal(result.refund?.amount, 180_000)
  assert.equal(result.refund?.status, "manual")
  // The money has not come back yet.
  assert.equal(bookingDoc.paymentStatus, "awaiting_verification")
})

void test("updateStatus cancel of a confirmed VietQR booking owes the player a refund", async () => {
  const { service, bookingDoc } = await makeService({
    bookingDoc: makeBookingDoc({
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "vietqr",
      amountDue: 150_000,
    }),
  })

  const { reservation } = await service.updateStatus(
    "v9",
    "b1",
    "cancelled",
    "Sự cố sân"
  )

  assert.equal(reservation.status, "cancelled")
  assert.equal(bookingDoc.status, "rejected_refund_pending")
  assert.equal(bookingDoc.refund?.amount, 150_000)
  assert.equal(bookingDoc.refund?.status, "manual")
})

void test("a player can cancel before sending a proof, but not after", async () => {
  const before = await makeService({ bookingDoc: unpaidDoc() })
  const result = await before.service.cancel("user-1", "b1", "Đổi lịch")
  assert.equal(result.status, "cancelled")
  assert.equal(result.refund, undefined)

  const after = await makeService({ bookingDoc: waitingDoc() })
  await assert.rejects(
    () => after.service.cancel("user-1", "b1"),
    /nhắn tin cho chủ sân/
  )
})

const refundPending = (overrides: Partial<FakeBookingDoc> = {}) =>
  waitingDoc({
    status: "rejected_refund_pending",
    refund: {
      pct: 100,
      amount: 180_000,
      at: vnNowIso(),
      status: "manual",
    },
    ...overrides,
  })

void test("completeRefund marks the refund done with the venue's screenshot", async () => {
  const { service, bookingDoc, notifications } = await makeService({
    bookingDoc: refundPending(),
  })

  const result = await service.completeRefund("owner-1", "b1", {
    proofUrl: PROOF_URL,
  })

  assert.equal(result.status, "refunded")
  assert.equal(result.paymentStatus, "refunded")
  assert.equal(result.refund?.status, "settled")
  assert.equal(result.refund?.proofUrl, PROOF_URL)
  assert.equal(bookingDoc.refundProofUrl, PROOF_URL)
  assert.equal(notifications[0]?.userId, "user-1")
})

void test("completeRefund accepts a smaller agreed amount and records a partial refund", async () => {
  const { service } = await makeService({ bookingDoc: refundPending() })
  const result = await service.completeRefund("owner-1", "b1", {
    proofUrl: PROOF_URL,
    amount: 90_000,
  })
  assert.equal(result.paymentStatus, "partial_refund")
  assert.equal(result.refund?.amount, 90_000)
  assert.equal(result.refund?.pct, 50)
})

void test("completeRefund rejects a bad amount, a wrong status and a stranger", async () => {
  const tooMuch = await makeService({ bookingDoc: refundPending() })
  await assert.rejects(
    () =>
      tooMuch.service.completeRefund("owner-1", "b1", {
        proofUrl: PROOF_URL,
        amount: 999_999,
      }),
    BadRequestException
  )
  const notQueued = await makeService({ bookingDoc: waitingDoc() })
  await assert.rejects(
    () =>
      notQueued.service.completeRefund("owner-1", "b1", {
        proofUrl: PROOF_URL,
      }),
    ConflictException
  )
  const stranger = await makeService({ bookingDoc: refundPending() })
  await assert.rejects(
    () =>
      stranger.service.completeRefund("someone", "b1", { proofUrl: PROOF_URL }),
    ForbiddenException
  )
})

const refundedDoc = () =>
  refundPending({
    status: "refunded",
    paymentStatus: "refunded",
    refundProofUrl: PROOF_URL,
  })

void test("confirmRefundReceipt records 'received' and tells the venue", async () => {
  const { service, bookingDoc, notifications, complaints } = await makeService({
    bookingDoc: refundedDoc(),
  })

  await service.confirmRefundReceipt("user-1", "b1", "received")

  assert.equal(bookingDoc.refundConfirmation?.result, "received")
  assert.equal(complaints.length, 0)
  assert.equal(notifications[0]?.userId, "owner-1")
})

void test("'not received' opens one complaint for an admin, however often it is repeated", async () => {
  const { service, complaints } = await makeService({
    bookingDoc: refundedDoc(),
  })

  await service.confirmRefundReceipt("user-1", "b1", "not_received")
  await service.confirmRefundReceipt("user-1", "b1", "not_received")

  assert.equal(complaints.length, 1)
  assert.equal(complaints[0]?.kind, "refund_not_received")
  assert.equal(complaints[0]?.amount, 180_000)
  assert.equal(complaints[0]?.status, "open")
})

void test("confirmRefundReceipt needs a finished refund and the booking's own player", async () => {
  const early = await makeService({ bookingDoc: refundPending() })
  await assert.rejects(
    () => early.service.confirmRefundReceipt("user-1", "b1", "received"),
    ConflictException
  )
  const stranger = await makeService({ bookingDoc: refundedDoc() })
  await assert.rejects(
    () => stranger.service.confirmRefundReceipt("other", "b1", "received"),
    ForbiddenException
  )
})
