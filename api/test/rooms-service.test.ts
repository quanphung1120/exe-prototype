import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { getModelToken } from "@nestjs/mongoose"

import { RoomsService } from "../src/features/rooms/rooms.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { RoomShare } from "../src/features/rooms/room-share.schema.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { StreamService } from "../src/features/stream/stream.service.js"
import { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * `RoomsService` (VienTD-Review Phase 9 G2, decision #16) is the only surface
 * that mutates a *different* user's `PlaySession` document — browsing listed
 * rooms, requesting to join, the host's approve/decline, and a member
 * leaving on their own. These tests mock the Mongoose model plus its three
 * collaborators (profile lookup, notifications, Stream chat), the same
 * pattern `sessions-service.test.ts`/`bookings-service.test.ts` use.
 */
function makeRoom(overrides: Partial<PlaySessionData> = {}): PlaySessionData {
  return {
    id: "room-1",
    title: "Badminton tối nay",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "today",
    dayLabel: "Hôm nay",
    slot: "18:00",
    durationMin: 60,
    courtLabel: "Court 1",
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [{ name: "Host", initials: "HO", rsvp: "host" }],
    level: "any",
    status: "forming",
    listed: true,
    fillIntent: "invite",
    venue: "Test Court",
    ward: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    ...overrides,
  }
}

interface RoomDoc {
  _id: string
  userId: string
  sessionId: string
  data: PlaySessionData
}

function makeDoc(userId: string, data: PlaySessionData, id = "doc-1"): RoomDoc {
  return { _id: id, userId, sessionId: data.id, data }
}

function findChain(docs: unknown[]) {
  return { sort: () => ({ lean: () => Promise.resolve(docs) }) }
}

interface FakeShare {
  shareId: string
  roomId: string
  bookingId: string
  hostUserId: string
  memberUserId: string
  amount: number
  status: "held" | "paid" | "refunded"
  leaveStatus?: "pending" | "rejected" | "approved"
  leaveRequestedAt?: string
  save: () => Promise<void>
}

interface FakeComplaint {
  complaintId: string
  roomId: string
  shareId: string
  memberUserId: string
  hostUserId: string
  amount: number
  reason: string
  status: "open" | "refunded" | "dismissed"
  adminNote?: string
  platformFunded?: boolean
  resolvedAt?: string
  save: () => Promise<void>
}

interface Recorder {
  notifications: { userId: string; input: unknown }[]
  addMember: { hostUserId: string; channelId: string; memberId: string }[]
  removeMember: { userId: string; channelId: string; memberId: string }[]
  /** Room ids announced on the live events stream. */
  events: string[]
  /** Wallet movements, in order. */
  wallet: {
    op: "debit" | "credit"
    userId: string
    amount: number
    txId: string
  }[]
  /** The in-memory `RoomShare` table. */
  shares: FakeShare[]
  /** The in-memory `RoomComplaint` table. */
  complaints: FakeComplaint[]
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>,
  opts: {
    profile?: { name: string; initials: string }
    streamFails?: boolean
    /** Clerk directory: user id → real display name. */
    directory?: Record<string, string>
    /** Bookings the court-share lookup finds (by `bookingId`). */
    bookings?: {
      bookingId: string
      price: number
      paymentStatus: string
      status: string
      startAt?: string
    }[]
    /** Pre-existing `RoomShare` rows. */
    shares?: FakeShare[]
    /** Pre-existing complaints. */
    complaints?: FakeComplaint[]
    /** User ids whose wallet debit fails with 402 (not enough balance). */
    brokeUsers?: string[]
  } = {}
) {
  const shares: FakeShare[] = [...(opts.shares ?? [])]
  const complaints: FakeComplaint[] = [...(opts.complaints ?? [])]
  const walletCalls: {
    op: "debit" | "credit"
    userId: string
    amount: number
    txId: string
  }[] = []
  const walletMock = {
    debit: (userId: string, amount: number, m: { txId: string }) => {
      if (opts.brokeUsers?.includes(userId)) {
        return Promise.reject(
          new HttpException("Số dư ví không đủ", HttpStatus.PAYMENT_REQUIRED)
        )
      }
      walletCalls.push({ op: "debit", userId, amount, txId: m.txId })
      return Promise.resolve({ balance: 0, applied: true })
    },
    credit: (userId: string, amount: number, m: { txId: string }) => {
      walletCalls.push({ op: "credit", userId, amount, txId: m.txId })
      return Promise.resolve({ balance: amount, applied: true })
    },
  }
  const bookingModelMock = {
    find: () => {
      const chain = {
        select: () => chain,
        lean: () => Promise.resolve(opts.bookings ?? []),
      }
      return chain
    },
  }
  const matchesShare = (s: FakeShare, f: Record<string, unknown>) =>
    Object.entries(f).every(([k, v]) => {
      const actual = (s as unknown as Record<string, unknown>)[k]
      if (v && typeof v === "object" && "$in" in v) {
        return (v as { $in: unknown[] }).$in.includes(actual)
      }
      return actual === v
    })
  const withSave = (s: FakeShare) =>
    Object.assign(s, { save: () => Promise.resolve() })
  const shareModelMock = {
    countDocuments: (f: Record<string, unknown>) =>
      Promise.resolve(shares.filter((s) => matchesShare(s, f)).length),
    exists: (f: Record<string, unknown>) =>
      Promise.resolve(shares.find((s) => matchesShare(s, f)) ? {} : null),
    findOne: (f: Record<string, unknown>) =>
      Promise.resolve(
        (() => {
          const hit = shares.find((s) => matchesShare(s, f))
          return hit ? withSave(hit) : null
        })()
      ),
    find: (f: Record<string, unknown>) => {
      const hits = shares.filter((s) => matchesShare(s, f)).map(withSave)
      return Object.assign(Promise.resolve(hits), {
        select: () => ({ lean: () => Promise.resolve(hits) }),
        lean: () => Promise.resolve(hits),
      })
    },
    create: (doc: Omit<FakeShare, "save">) => {
      const row = withSave({ ...doc } as FakeShare)
      shares.push(row)
      return Promise.resolve(row)
    },
  }
  const directoryMock = {
    getMany: (ids: string[]) =>
      Promise.resolve(
        ids.flatMap((id) =>
          opts.directory?.[id] ? [{ id, name: opts.directory[id] }] : []
        )
      ),
  }
  const recorder: Recorder = {
    notifications: [],
    addMember: [],
    removeMember: [],
    events: [],
    wallet: walletCalls,
    shares,
    complaints,
  }
  const eventsMock = {
    emit: (roomId: string) => {
      recorder.events.push(roomId)
    },
  }
  const notificationsMock = {
    create: (userId: string, input: unknown) => {
      recorder.notifications.push({ userId, input })
      return Promise.resolve()
    },
  }
  const profilesMock = {
    getProfile: () =>
      Promise.resolve({
        user: opts.profile ?? { name: "Người chơi", initials: "NC" },
      }),
  }
  const streamMock = {
    addRoomMember: (
      hostUserId: string,
      channelId: string,
      memberId: string
    ) => {
      recorder.addMember.push({ hostUserId, channelId, memberId })
      if (opts.streamFails) return Promise.reject(new Error("stream down"))
      return Promise.resolve()
    },
    removeRoomMember: (userId: string, channelId: string, memberId: string) => {
      recorder.removeMember.push({ userId, channelId, memberId })
      if (opts.streamFails) return Promise.reject(new Error("stream down"))
      return Promise.resolve()
    },
  }

  const complaintMatches = (c: FakeComplaint, f: Record<string, unknown>) =>
    Object.entries(f).every(([k, v]) => {
      const actual = (c as unknown as Record<string, unknown>)[k]
      if (v && typeof v === "object" && "$in" in v) {
        return (v as { $in: unknown[] }).$in.includes(actual)
      }
      return actual === v
    })
  const complaintModelMock = {
    exists: (f: Record<string, unknown>) =>
      Promise.resolve(
        complaints.find((c) => complaintMatches(c, f)) ? {} : null
      ),
    findOne: (f: Record<string, unknown>) =>
      Promise.resolve(complaints.find((c) => complaintMatches(c, f)) ?? null),
    find: (f: Record<string, unknown> = {}) => {
      const hits = complaints.filter((c) => complaintMatches(c, f))
      const chain = {
        sort: () => chain,
        lean: () => Promise.resolve(hits),
      }
      return chain
    },
    create: (doc: Omit<FakeComplaint, "save">) => {
      const row = { ...doc, save: () => Promise.resolve() }
      complaints.push(row)
      return Promise.resolve(row)
    },
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      RoomsService,
      {
        provide: getModelToken(RoomComplaint.name),
        useValue: complaintModelMock,
      },
      { provide: getModelToken(PlaySession.name), useValue: modelMock },
      { provide: NotificationsService, useValue: notificationsMock },
      { provide: ProfileService, useValue: profilesMock },
      { provide: StreamService, useValue: streamMock },
      { provide: ClerkDirectoryService, useValue: directoryMock },
      { provide: RoomEventsService, useValue: eventsMock },
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(RoomShare.name), useValue: shareModelMock },
      { provide: WalletService, useValue: walletMock },
      {
        provide: BookingsService,
        useValue: {
          refundDeclinedCancel: () => Promise.resolve(1),
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(RoomsService), recorder }
}

// ── listRooms ────────────────────────────────────────────────────────────────

void test("listRooms queries listed, non-demo, active rooms and returns their data", async () => {
  const docs = [makeDoc("host-1", makeRoom())]
  let usedFilter: unknown
  const { service } = await makeService({
    find: (filter: unknown) => {
      usedFilter = filter
      return findChain(docs)
    },
  })

  const rooms = await service.listRooms()

  assert.deepEqual(usedFilter, {
    "data.listed": true,
    "data.demo": { $ne: true },
    "data.status": { $in: ["forming", "booked"] },
    "data.roster": { $type: "array" },
  })
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0]?.id, "room-1")
})

void test("listRooms stamps the host's roster entry with the owner's userId", async () => {
  const docs = [
    makeDoc(
      "host-1",
      makeRoom({
        roster: [
          { name: "Host", initials: "HO", rsvp: "host" },
          { name: "Mai", initials: "MA", rsvp: "going", userId: "user-2" },
        ],
      })
    ),
  ]
  const { service } = await makeService({ find: () => findChain(docs) })

  const [room] = await service.listRooms()

  assert.deepEqual(
    room?.roster.map((p) => p.userId),
    ["host-1", "user-2"]
  )
})

void test("listRooms shows real Clerk names instead of the stored demo identity", async () => {
  const docs = [
    makeDoc(
      "host-1",
      makeRoom({
        host: { name: "Nguyễn Minh", initials: "NM" },
        roster: [
          { name: "Nguyễn Minh", initials: "NM", rsvp: "host" },
          {
            name: "Nguyễn Minh",
            initials: "NM",
            rsvp: "requested",
            userId: "user-2",
          },
        ],
      })
    ),
  ]
  const { service } = await makeService(
    { find: () => findChain(docs) },
    { directory: { "host-1": "Trương Viên", "user-2": "Lê Lan" } }
  )

  const [room] = await service.listRooms()

  assert.deepEqual(room?.host, { name: "Trương Viên", initials: "TV" })
  assert.equal(room?.roster[0]?.name, "Trương Viên")
  assert.equal(room?.roster[0]?.initials, "TV")
  // A request keeps its stored initials (the host's client matches on them).
  assert.equal(room?.roster[1]?.name, "Lê Lan")
  assert.equal(room?.roster[1]?.initials, "NM")
})

void test("listRooms keeps stored names when the Clerk directory is unavailable", async () => {
  const docs = [makeDoc("host-1", makeRoom())]
  const { service } = await makeService({ find: () => findChain(docs) })

  const [room] = await service.listRooms()

  assert.deepEqual(room?.host, { name: "Host", initials: "HO" })
})

// ── requestJoin ──────────────────────────────────────────────────────────────

void test("requestJoin pushes a requested roster entry and notifies the host", async () => {
  const doc = makeDoc("host-1", makeRoom())
  let pushedUpdate: unknown
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(doc),
      updateOne: (_filter: unknown, update: unknown) => {
        pushedUpdate = update
        return Promise.resolve({ acknowledged: true })
      },
    },
    { profile: { name: "Trần Huy", initials: "TH" } }
  )

  await service.requestJoin("guest-1", "room-1")

  const entry = (
    pushedUpdate as { $push: { "data.roster": PlaySessionData["roster"][0] } }
  ).$push["data.roster"]
  assert.equal(entry.userId, "guest-1")
  assert.equal(entry.rsvp, "requested")
  assert.equal(entry.name, "Trần Huy")
  assert.equal(entry.initials, "TH")

  assert.equal(recorder.notifications.length, 1)
  assert.equal(recorder.notifications[0]?.userId, "host-1")
  // Suffixed with a fresh id (not just `room-request-{roomId}-{userId}`) so a
  // request→decline→request cycle doesn't reuse a dedupe key an earlier
  // request notification already claimed — see rooms.service.ts.
  assert.match(
    (recorder.notifications[0]?.input as { id: string }).id,
    /^room-request-room-1-guest-1-[\w-]+$/
  )
})

void test("requestJoin rejects the room's own host", async () => {
  const doc = makeDoc("host-1", makeRoom())
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.requestJoin("host-1", "room-1"),
    BadRequestException
  )
})

void test("requestJoin rejects when the room is already full", async () => {
  const full = makeRoom({
    capacity: 2,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "going" },
    ],
  })
  const doc = makeDoc("host-1", full)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.requestJoin("guest-1", "room-1"),
    ConflictException
  )
})

void test("requestJoin allows a request while others are still pending (doesn't count against capacity)", async () => {
  const room = makeRoom({
    capacity: 2,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      {
        name: "Nam",
        initials: "NM",
        rsvp: "requested",
        userId: "other-guest",
      },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  await service.requestJoin("guest-1", "room-1")
})

void test("requestJoin rejects a duplicate request from the same user", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.requestJoin("guest-1", "room-1"),
    ConflictException
  )
})

void test("requestJoin rejects an unknown room id", async () => {
  const { service } = await makeService({
    findOne: () => Promise.resolve(null),
  })

  await assert.rejects(
    () => service.requestJoin("guest-1", "missing"),
    NotFoundException
  )
})

// ── decideRequest ────────────────────────────────────────────────────────────

void test("decideRequest approve flips the roster entry, notifies the requester, and adds the chat member", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  let setUpdate: unknown
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: (_filter: unknown, update: unknown) => {
      setUpdate = update
      return Promise.resolve({ matchedCount: 1 })
    },
  })

  await service.decideRequest("host-1", "room-1", "guest-1", "approve")

  assert.deepEqual(setUpdate, {
    $set: { "data.roster.$.rsvp": "going" },
  })
  assert.equal(recorder.notifications.length, 1)
  assert.equal(recorder.notifications[0]?.userId, "guest-1")
  assert.equal(recorder.addMember.length, 1)
  assert.equal(recorder.addMember[0]?.hostUserId, "host-1")
  assert.equal(recorder.addMember[0]?.memberId, "guest-1")
})

void test("decideRequest approve still succeeds when the chat add fails (best-effort)", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(doc),
      updateOne: () => Promise.resolve({ matchedCount: 1 }),
    },
    { streamFails: true }
  )

  await service.decideRequest("host-1", "room-1", "guest-1", "approve")

  // The roster/notification side effect still lands even though Stream failed.
  assert.equal(recorder.notifications.length, 1)
})

void test("decideRequest decline pulls the roster entry and notifies the requester", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  let pullUpdate: unknown
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: (_filter: unknown, update: unknown) => {
      pullUpdate = update
      return Promise.resolve({ acknowledged: true })
    },
  })

  await service.decideRequest("host-1", "room-1", "guest-1", "decline")

  assert.deepEqual(pullUpdate, {
    $pull: { "data.roster": { userId: "guest-1" } },
  })
  assert.equal(recorder.notifications.length, 1)
  assert.equal(recorder.notifications[0]?.userId, "guest-1")
  assert.equal(recorder.removeMember.length, 1)
})

void test("decideRequest decline notification id doesn't collide across a re-request/re-decline cycle", async () => {
  // A user can be declined, then request the same room again (decline pulls
  // their roster entry, so `requestJoin`'s duplicate check no longer blocks
  // it) — a stable `room-declined-{roomId}-{userId}` dedupe key would let
  // `NotificationsService#create`'s duplicate-key swallow silently drop the
  // second decline's notification. Regression for that.
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  await service.decideRequest("host-1", "room-1", "guest-1", "decline")
  // Simulate the re-request: the roster entry is back as "requested".
  doc.data.roster.push({
    name: "Nam",
    initials: "NM",
    rsvp: "requested",
    userId: "guest-1",
  })
  await service.decideRequest("host-1", "room-1", "guest-1", "decline")

  assert.equal(recorder.notifications.length, 2)
  const ids = recorder.notifications.map((n) => (n.input as { id: string }).id)
  assert.notEqual(ids[0], ids[1])
})

void test("decideRequest rejects a non-host caller", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.decideRequest("not-host", "room-1", "guest-1", "approve"),
    ForbiddenException
  )
})

void test("decideRequest approve rejects once the room has filled up", async () => {
  const room = makeRoom({
    capacity: 2,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Other", initials: "OT", rsvp: "going" },
      { name: "Nam", initials: "NM", rsvp: "requested", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.decideRequest("host-1", "room-1", "guest-1", "approve"),
    ConflictException
  )
})

void test("decideRequest rejects an unknown/already-resolved request", async () => {
  const room = makeRoom({
    roster: [{ name: "Host", initials: "HO", rsvp: "host" }],
  })
  const doc = makeDoc("host-1", room)
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.decideRequest("host-1", "room-1", "guest-1", "approve"),
    NotFoundException
  )
})

// ── disbandRoom ──────────────────────────────────────────────────────────────

const ROSTER_WITH_MEMBERS: PlaySessionData["roster"] = [
  { name: "Host", initials: "HO", rsvp: "host" },
  { name: "Mai", initials: "MA", rsvp: "going", userId: "user-2" },
  { name: "Lan", initials: "LA", rsvp: "requested", userId: "user-3" },
]

void test("disbandRoom deletes a forming room and notifies every member and requester", async () => {
  const doc = makeDoc("host-1", makeRoom({ roster: ROSTER_WITH_MEMBERS }))
  let deleted: unknown
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    deleteOne: (filter: unknown) => {
      deleted = filter
      return Promise.resolve({ deletedCount: 1 })
    },
  })

  await service.disbandRoom("host-1", "room-1")

  assert.deepEqual(deleted, { _id: "doc-1" })
  assert.deepEqual(recorder.events, ["room-1"])
  assert.deepEqual(recorder.notifications.map((n) => n.userId).sort(), [
    "user-2",
    "user-3",
  ])
  assert.match(
    (recorder.notifications[0]?.input as { text: string }).text,
    /đã huỷ phòng/
  )
})

void test("disbandRoom delists a booked room as cancelled instead of deleting it", async () => {
  const doc = makeDoc(
    "host-1",
    makeRoom({ status: "booked", reservationId: "res-1" })
  )
  let update: unknown
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: (_filter: unknown, u: unknown) => {
      update = u
      return Promise.resolve({ acknowledged: true })
    },
    deleteOne: () => assert.fail("a booked room must not be deleted"),
  })

  await service.disbandRoom("host-1", "room-1")

  assert.deepEqual(update, {
    $set: { "data.listed": false, "data.status": "cancelled" },
  })
})

void test("disbandRoom rejects anyone but the host", async () => {
  const doc = makeDoc("host-1", makeRoom({ roster: ROSTER_WITH_MEMBERS }))
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
    deleteOne: () => assert.fail("must not delete"),
  })

  await assert.rejects(
    service.disbandRoom("user-2", "room-1"),
    ForbiddenException
  )
})

// ── leaveRoom ────────────────────────────────────────────────────────────────

void test("leaveRoom pulls the caller's own roster entry and removes them from chat", async () => {
  const room = makeRoom({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "Nam", initials: "NM", rsvp: "going", userId: "guest-1" },
    ],
  })
  const doc = makeDoc("host-1", room)
  let pullUpdate: unknown
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: (_filter: unknown, update: unknown) => {
      pullUpdate = update
      return Promise.resolve({ acknowledged: true })
    },
  })

  await service.leaveRoom("guest-1", "room-1")

  assert.deepEqual(pullUpdate, {
    $pull: { "data.roster": { userId: "guest-1" } },
  })
  assert.equal(recorder.removeMember.length, 1)
  assert.equal(recorder.removeMember[0]?.userId, "guest-1")
  assert.equal(recorder.removeMember[0]?.memberId, "guest-1")
})

void test("leaveRoom rejects the host (must cancel instead)", async () => {
  const doc = makeDoc("host-1", makeRoom())
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.leaveRoom("host-1", "room-1"),
    BadRequestException
  )
})

void test("leaveRoom rejects a user who isn't in the roster", async () => {
  const doc = makeDoc("host-1", makeRoom())
  const { service } = await makeService({
    findOne: () => Promise.resolve(doc),
  })

  await assert.rejects(
    () => service.leaveRoom("stranger", "room-1"),
    NotFoundException
  )
})

// ── Court cost sharing ───────────────────────────────────────────────────────

/** A booked room whose court the host has paid 400k for (capacity 4 → 100k a seat). */
function paidCourt(overrides: Partial<PlaySessionData> = {}) {
  return {
    room: makeRoom({
      status: "booked",
      reservationId: "bk-1",
      capacity: 4,
      ...overrides,
    }),
    bookings: [
      {
        bookingId: "bk-1",
        price: 400_000,
        paymentStatus: "paid",
        status: "pending",
        startAt: "2026-10-10T18:00:00+07:00",
      },
    ],
  }
}

void test("listRooms exposes the per-seat share once the host has paid for the court", async () => {
  const { room, bookings } = paidCourt()
  const { service } = await makeService(
    { find: () => findChain([makeDoc("host-1", room)]) },
    { bookings }
  )

  const [listed] = await service.listRooms()

  assert.equal(listed?.sharePrice, 100_000)
})

void test("listRooms shows no share while the court is booked but unpaid", async () => {
  const { room, bookings } = paidCourt()
  const { service } = await makeService(
    { find: () => findChain([makeDoc("host-1", room)]) },
    { bookings: [{ ...bookings[0], paymentStatus: "awaiting" }] }
  )

  const [listed] = await service.listRooms()

  assert.equal(listed?.sharePrice, undefined)
})

void test("requestJoin on a paid-court room takes the seat's share from the requester and holds it", async () => {
  const { room, bookings } = paidCourt()
  const doc = makeDoc("host-1", room)
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(doc),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    { bookings }
  )

  await service.requestJoin("guest-1", "room-1")

  assert.deepEqual(
    recorder.wallet.map(({ op, userId, amount }) => ({ op, userId, amount })),
    [{ op: "debit", userId: "guest-1", amount: 100_000 }]
  )
  assert.equal(recorder.shares.length, 1)
  assert.equal(recorder.shares[0]?.status, "held")
  assert.equal(recorder.shares[0]?.hostUserId, "host-1")
  assert.match(
    (recorder.notifications[0]?.input as { text: string }).text,
    /đã đóng 100\.000₫ tiền sân/
  )
})

void test("requestJoin with too little wallet balance fails 402 and leaves the room untouched", async () => {
  const { room, bookings } = paidCourt()
  const doc = makeDoc("host-1", room)
  let pushed = false
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(doc),
      updateOne: () => {
        pushed = true
        return Promise.resolve({ acknowledged: true })
      },
    },
    { bookings, brokeUsers: ["guest-1"] }
  )

  await assert.rejects(
    () => service.requestJoin("guest-1", "room-1"),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 402
  )
  assert.equal(pushed, false)
  assert.deepEqual(recorder.shares, [])
  assert.deepEqual(recorder.notifications, [])
})

void test("requestJoin on a room with no paid court moves no money", async () => {
  const doc = makeDoc("host-1", makeRoom())
  const { service, recorder } = await makeService({
    findOne: () => Promise.resolve(doc),
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  await service.requestJoin("guest-1", "room-1")

  assert.deepEqual(recorder.wallet, [])
  assert.deepEqual(recorder.shares, [])
})

function heldShare(overrides: Partial<FakeShare> = {}): FakeShare {
  return {
    shareId: "room-1:guest-1:0",
    roomId: "room-1",
    bookingId: "bk-1",
    hostUserId: "host-1",
    memberUserId: "guest-1",
    amount: 100_000,
    status: "held",
    save: () => Promise.resolve(),
    ...overrides,
  }
}

void test("approving a request releases the held share into the host's wallet", async () => {
  const { room, bookings } = paidCourt({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      {
        name: "Guest",
        initials: "GU",
        rsvp: "requested",
        userId: "guest-1",
      },
    ],
  })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ matchedCount: 1 }),
    },
    { bookings, shares: [heldShare()] }
  )

  await service.decideRequest("host-1", "room-1", "guest-1", "approve")

  assert.deepEqual(
    recorder.wallet.map(({ op, userId, amount }) => ({ op, userId, amount })),
    [{ op: "credit", userId: "host-1", amount: 100_000 }]
  )
  assert.equal(recorder.shares[0]?.status, "paid")
})

void test("declining a request returns the held share to the requester", async () => {
  const { room, bookings } = paidCourt({
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      {
        name: "Guest",
        initials: "GU",
        rsvp: "requested",
        userId: "guest-1",
      },
    ],
  })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    { bookings, shares: [heldShare()] }
  )

  await service.decideRequest("host-1", "room-1", "guest-1", "decline")

  assert.deepEqual(
    recorder.wallet.map(({ op, userId, amount }) => ({ op, userId, amount })),
    [{ op: "credit", userId: "guest-1", amount: 100_000 }]
  )
  assert.equal(recorder.shares[0]?.status, "refunded")
})

const memberRoster = [
  { name: "Host", initials: "HO", rsvp: "host" as const },
  {
    name: "Lan",
    initials: "LA",
    rsvp: "going" as const,
    userId: "guest-1",
  },
]

void test("payShare moves the member's share into the host's wallet and records it", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    { findOne: () => Promise.resolve(makeDoc("host-1", room)) },
    { bookings }
  )

  await service.payShare("guest-1", "room-1")

  assert.deepEqual(
    recorder.wallet.map(({ op, userId, amount }) => ({ op, userId, amount })),
    [
      { op: "debit", userId: "guest-1", amount: 100_000 },
      { op: "credit", userId: "host-1", amount: 100_000 },
    ]
  )
  assert.equal(recorder.shares[0]?.status, "paid")
  assert.equal(recorder.notifications[0]?.userId, "host-1")
})

void test("payShare with too little balance fails 402 and records nothing", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    { findOne: () => Promise.resolve(makeDoc("host-1", room)) },
    { bookings, brokeUsers: ["guest-1"] }
  )

  await assert.rejects(
    () => service.payShare("guest-1", "room-1"),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 402
  )
  assert.deepEqual(recorder.wallet, [])
  assert.deepEqual(recorder.shares, [])
})

void test("payShare refuses a second payment, a non-member, the host and an unpaid court", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const findOne = () => Promise.resolve(makeDoc("host-1", room))

  const paid = await makeService(
    { findOne },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )
  await assert.rejects(
    () => paid.service.payShare("guest-1", "room-1"),
    ConflictException
  )

  const fresh = await makeService({ findOne }, { bookings })
  await assert.rejects(
    () => fresh.service.payShare("stranger", "room-1"),
    ForbiddenException
  )
  await assert.rejects(
    () => fresh.service.payShare("host-1", "room-1"),
    BadRequestException
  )

  const unpaid = await makeService(
    { findOne },
    { bookings: [{ ...bookings[0], paymentStatus: "awaiting" }] }
  )
  await assert.rejects(
    () => unpaid.service.payShare("guest-1", "room-1"),
    ConflictException
  )
})

void test("dueShares lists confirmed memberships whose court is paid and share isn't", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service } = await makeService(
    {
      find: () => ({
        sort: () => ({
          lean: () => Promise.resolve([makeDoc("host-1", room)]),
        }),
      }),
    },
    { bookings }
  )

  const due = await service.dueShares("guest-1")

  assert.equal(due.length, 1)
  assert.equal(due[0]?.roomId, "room-1")
  assert.equal(due[0]?.amount, 100_000)
  assert.equal(due[0]?.hostName, "Host")
})

void test("dueShares skips a room the member already paid", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service } = await makeService(
    {
      find: () => ({
        sort: () => ({
          lean: () => Promise.resolve([makeDoc("host-1", room)]),
        }),
      }),
    },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )

  assert.deepEqual(await service.dueShares("guest-1"), [])
})

void test("disbanding a paid-court room refunds every member's share", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )

  await service.disbandRoom("host-1", "room-1")

  assert.equal(recorder.shares[0]?.status, "refunded")
  assert.equal(
    recorder.wallet.filter((w) => w.op === "credit" && w.userId === "guest-1")
      .length,
    1
  )
})

// ── Leaving a paid-court room, and complaints ────────────────────────────────

const walletMoves = (rec: {
  wallet: { op: string; userId: string; amount: number }[]
}) => rec.wallet.map(({ op, userId, amount }) => ({ op, userId, amount }))

void test("a member who paid can't just leave: it files a request the host must approve", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  let rosterChanged = false
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => {
        rosterChanged = true
        return Promise.resolve({ acknowledged: true })
      },
    },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )

  const result = await service.leaveRoom("guest-1", "room-1")

  assert.deepEqual(result, { status: "requested" })
  assert.equal(recorder.shares[0]?.leaveStatus, "pending")
  assert.ok(recorder.shares[0]?.leaveRequestedAt)
  assert.deepEqual(recorder.wallet, [])
  assert.equal(rosterChanged, false)
  assert.equal(recorder.notifications[0]?.userId, "host-1")
  assert.match(
    (recorder.notifications[0]?.input as { text: string }).text,
    /xin rời phòng/
  )
})

void test("a pending leave request can't be filed twice, but a refused one can be sent again", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const findOne = () => Promise.resolve(makeDoc("host-1", room))

  const pending = await makeService(
    { findOne },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "pending" })],
    }
  )
  await assert.rejects(
    () => pending.service.leaveRoom("guest-1", "room-1"),
    /đang chờ chủ phòng duyệt/
  )

  const rejected = await makeService(
    { findOne },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
    }
  )
  const result = await rejected.service.leaveRoom("guest-1", "room-1")
  assert.deepEqual(result, { status: "requested" })
  assert.equal(rejected.recorder.shares[0]?.leaveStatus, "pending")
  assert.equal(rejected.recorder.notifications[0]?.userId, "host-1")
})

void test("a member who hasn't paid yet leaves straight away", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    { bookings }
  )

  const result = await service.leaveRoom("guest-1", "room-1")

  assert.deepEqual(result, { status: "left" })
  assert.deepEqual(recorder.wallet, [])
  assert.equal(recorder.removeMember.length, 1)
})

void test("approving a leave request refunds the member out of the host's wallet and removes them", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  let pulled = false
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => {
        pulled = true
        return Promise.resolve({ acknowledged: true })
      },
    },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "pending" })],
    }
  )

  await service.decideLeave("host-1", "room-1", "guest-1", "approve")

  assert.deepEqual(walletMoves(recorder), [
    { op: "debit", userId: "host-1", amount: 100_000 },
    { op: "credit", userId: "guest-1", amount: 100_000 },
  ])
  assert.equal(recorder.shares[0]?.status, "refunded")
  assert.equal(recorder.shares[0]?.leaveStatus, "approved")
  assert.equal(pulled, true)
  assert.match(
    (recorder.notifications.at(-1)?.input as { text: string }).text,
    /đã được hoàn vào ví/
  )
})

void test("approving fails 402 when the host can't cover the refund, and nothing changes", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    {
      bookings,
      brokeUsers: ["host-1"],
      shares: [heldShare({ status: "paid", leaveStatus: "pending" })],
    }
  )

  await assert.rejects(
    () => service.decideLeave("host-1", "room-1", "guest-1", "approve"),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 402
  )
  assert.equal(recorder.shares[0]?.status, "paid")
  assert.equal(recorder.shares[0]?.leaveStatus, "pending")
})

void test("declining a leave request keeps the member and the money, and points at the complaint route", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    { findOne: () => Promise.resolve(makeDoc("host-1", room)) },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "pending" })],
    }
  )

  await service.decideLeave("host-1", "room-1", "guest-1", "decline")

  assert.equal(recorder.shares[0]?.status, "paid")
  assert.equal(recorder.shares[0]?.leaveStatus, "rejected")
  assert.deepEqual(recorder.wallet, [])
  assert.match(
    (recorder.notifications[0]?.input as { text: string }).text,
    /khiếu nại/
  )
})

void test("only the host decides a leave request, and only a pending one", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const findOne = () => Promise.resolve(makeDoc("host-1", room))

  const a = await makeService(
    { findOne },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "pending" })],
    }
  )
  await assert.rejects(
    () => a.service.decideLeave("guest-1", "room-1", "guest-1", "approve"),
    ForbiddenException
  )

  const b = await makeService(
    { findOne },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )
  await assert.rejects(
    () => b.service.decideLeave("host-1", "room-1", "guest-1", "approve"),
    NotFoundException
  )
})

const HOUR_MS = 60 * 60 * 1000
const isoAgo = (ms: number) =>
  new Date(Date.now() - ms + 7 * HOUR_MS).toISOString().slice(0, 19) + "+07:00"

void test("a member whose leave was refused can file a complaint", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    { findOne: () => Promise.resolve(makeDoc("host-1", room)) },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
    }
  )

  await service.fileComplaint(
    "guest-1",
    "room-1",
    "Tôi có việc đột xuất, xin hoàn tiền"
  )

  assert.equal(recorder.complaints.length, 1)
  assert.equal(recorder.complaints[0]?.status, "open")
  assert.equal(recorder.complaints[0]?.amount, 100_000)
  assert.equal(recorder.complaints[0]?.hostUserId, "host-1")
  assert.equal(recorder.notifications[0]?.userId, "host-1")
})

void test("an unanswered leave request can only be escalated after 24 hours", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const findOne = () => Promise.resolve(makeDoc("host-1", room))

  const fresh = await makeService(
    { findOne },
    {
      bookings,
      shares: [
        heldShare({
          status: "paid",
          leaveStatus: "pending",
          leaveRequestedAt: isoAgo(2 * HOUR_MS),
        }),
      ],
    }
  )
  await assert.rejects(
    () =>
      fresh.service.fileComplaint(
        "guest-1",
        "room-1",
        "Chủ phòng không trả lời"
      ),
    /sau 24 giờ/
  )

  const stale = await makeService(
    { findOne },
    {
      bookings,
      shares: [
        heldShare({
          status: "paid",
          leaveStatus: "pending",
          leaveRequestedAt: isoAgo(25 * HOUR_MS),
        }),
      ],
    }
  )
  await stale.service.fileComplaint(
    "guest-1",
    "room-1",
    "Chủ phòng không trả lời"
  )
  assert.equal(stale.recorder.complaints.length, 1)
})

void test("a complaint needs a refused/pending leave, and only one may be open", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const findOne = () => Promise.resolve(makeDoc("host-1", room))

  const none = await makeService(
    { findOne },
    { bookings, shares: [heldShare({ status: "paid" })] }
  )
  await assert.rejects(
    () =>
      none.service.fileComplaint("guest-1", "room-1", "Lý do khiếu nại dài"),
    ConflictException
  )

  const dup = await makeService(
    { findOne },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
      complaints: [
        {
          complaintId: "c1",
          roomId: "room-1",
          shareId: "room-1:guest-1:0",
          memberUserId: "guest-1",
          hostUserId: "host-1",
          amount: 100_000,
          reason: "x",
          status: "open",
          save: () => Promise.resolve(),
        },
      ],
    }
  )
  await assert.rejects(
    () => dup.service.fileComplaint("guest-1", "room-1", "Lý do khiếu nại dài"),
    /đã gửi khiếu nại/
  )
})

function openComplaint(overrides: Partial<FakeComplaint> = {}): FakeComplaint {
  return {
    complaintId: "c1",
    roomId: "room-1",
    shareId: "room-1:guest-1:0",
    memberUserId: "guest-1",
    hostUserId: "host-1",
    amount: 100_000,
    reason: "Xin hoàn tiền",
    status: "open",
    save: () => Promise.resolve(),
    ...overrides,
  }
}

void test("admin refunding a complaint returns the share from the host and removes the member", async () => {
  const { room } = paidCourt({ roster: memberRoster })
  let pulled = false
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => {
        pulled = true
        return Promise.resolve({ acknowledged: true })
      },
    },
    {
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
      complaints: [openComplaint()],
    }
  )

  const row = await service.resolveComplaint("c1", "refund", "Hợp lý")

  assert.equal(row.status, "refunded")
  assert.equal(row.platformFunded, undefined)
  assert.deepEqual(walletMoves(recorder), [
    { op: "debit", userId: "host-1", amount: 100_000 },
    { op: "credit", userId: "guest-1", amount: 100_000 },
  ])
  assert.equal(recorder.shares[0]?.status, "refunded")
  assert.equal(pulled, true)
})

void test("admin refund is platform-funded when the host's wallet can't cover it", async () => {
  const { room } = paidCourt({ roster: memberRoster })
  const { service, recorder } = await makeService(
    {
      findOne: () => Promise.resolve(makeDoc("host-1", room)),
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    {
      brokeUsers: ["host-1"],
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
      complaints: [openComplaint()],
    }
  )

  const row = await service.resolveComplaint("c1", "refund")

  assert.equal(row.platformFunded, true)
  assert.deepEqual(walletMoves(recorder), [
    { op: "credit", userId: "guest-1", amount: 100_000 },
  ])
})

void test("dismissing a complaint moves no money; a resolved one can't be resolved again", async () => {
  const { service, recorder } = await makeService(
    {},
    {
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
      complaints: [openComplaint()],
    }
  )

  const row = await service.resolveComplaint("c1", "dismiss", "Không đủ căn cứ")

  assert.equal(row.status, "dismissed")
  assert.equal(row.adminNote, "Không đủ căn cứ")
  assert.deepEqual(recorder.wallet, [])
  assert.equal(recorder.shares[0]?.status, "paid")
  await assert.rejects(
    () => service.resolveComplaint("c1", "refund"),
    ConflictException
  )
  await assert.rejects(
    () => service.resolveComplaint("nope", "refund"),
    NotFoundException
  )
})

void test("listComplaints puts open ones first", async () => {
  const { service } = await makeService(
    {},
    {
      complaints: [
        openComplaint({ complaintId: "done", status: "dismissed" }),
        openComplaint({ complaintId: "open" }),
      ].map((c) => ({
        ...c,
        roomTitle: "r",
        bookingId: "bk-1",
        memberName: "m",
        hostName: "h",
        filedAt: "2026-10-09T10:00:00+07:00",
      })) as unknown as FakeComplaint[],
    }
  )

  const rows = await service.listComplaints()

  assert.deepEqual(
    rows.map((r) => r.id),
    ["open", "done"]
  )
})

void test("roomShares reports leave requests and complaints per member", async () => {
  const { room, bookings } = paidCourt({ roster: memberRoster })
  const { service } = await makeService(
    { findOne: () => Promise.resolve(makeDoc("host-1", room)) },
    {
      bookings,
      shares: [heldShare({ status: "paid", leaveStatus: "rejected" })],
      complaints: [openComplaint()],
    }
  )

  const info = await service.roomShares("host-1", "room-1")

  assert.equal(info.members[0]?.leave, "rejected")
  assert.equal(info.members[0]?.complaint, "open")
})
