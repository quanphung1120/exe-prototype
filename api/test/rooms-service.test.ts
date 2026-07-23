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
import { getModelToken } from "@nestjs/mongoose"

import { RoomsService } from "../src/features/rooms/rooms.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { StreamService } from "../src/features/stream/stream.service.js"
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
    district: "Q1",
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

interface Recorder {
  notifications: { userId: string; input: unknown }[]
  addMember: { hostUserId: string; channelId: string; memberId: string }[]
  removeMember: { userId: string; channelId: string; memberId: string }[]
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>,
  opts: {
    profile?: { name: string; initials: string }
    streamFails?: boolean
  } = {}
) {
  const recorder: Recorder = {
    notifications: [],
    addMember: [],
    removeMember: [],
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

  const moduleRef = await Test.createTestingModule({
    providers: [
      RoomsService,
      { provide: getModelToken(PlaySession.name), useValue: modelMock },
      { provide: NotificationsService, useValue: notificationsMock },
      { provide: ProfileService, useValue: profilesMock },
      { provide: StreamService, useValue: streamMock },
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
  })
  assert.equal(rooms.length, 1)
  assert.equal(rooms[0]?.id, "room-1")
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
