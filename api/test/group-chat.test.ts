import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { getModelToken } from "@nestjs/mongoose"

import {
  isSessionBooked,
  isSessionEnded,
  sessionParticipantIds,
  toGroupMatch,
} from "../src/features/rooms/group-match.js"
import { RoomsService } from "../src/features/rooms/rooms.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { RoomShare } from "../src/features/rooms/room-share.schema.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import {
  ClerkDirectoryService,
  type DirectoryUser,
} from "../src/features/stream/clerk-directory.service.js"
import {
  MAX_GROUP_MEMBERS,
  STREAM_CLIENT,
  StreamService,
  isGroupChannel,
} from "../src/features/stream/stream.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { Brand } from "../src/features/brands/brand.schema.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * Group-chat management: the pure "match a group coordinates" projections
 * (group-match.ts), `RoomsService#groupMatch` (what any member sees), and
 * `StreamService`'s rename/add-members. Fakes follow rooms-service.test.ts
 * and stream-community.test.ts — no real Stream app, Mongo or Clerk.
 */

function makeSession(
  overrides: Partial<PlaySessionData> = {}
): PlaySessionData {
  return {
    id: "s-1",
    title: "Cầu lông tối thứ 6",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2026-10-02",
    dayLabel: "Thứ 6",
    slot: "18:00",
    durationMin: 60,
    courtLabel: "Court 2",
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "An", initials: "AN", rsvp: "going", userId: "user-an" },
      { name: "Bình", initials: "BI", rsvp: "requested", userId: "user-bi" },
      { name: "Mock", initials: "MK", rsvp: "going" },
    ],
    level: "any",
    status: "booked",
    reservationId: "bk-1",
    listed: false,
    fillIntent: "court",
    venue: "Sân ABC",
    ward: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    ...overrides,
  }
}

// ── group-match.ts ──────────────────────────────────────────────────────────

void test("isSessionBooked: held/paid sessions count, proposed or cancelled ones don't", () => {
  assert.equal(isSessionBooked(makeSession()), true)
  assert.equal(
    isSessionBooked(
      makeSession({ status: "forming", reservationId: undefined })
    ),
    false
  )
  assert.equal(isSessionBooked(makeSession({ status: "cancelled" })), false)
  assert.equal(isSessionBooked(makeSession({ status: "completed" })), true)
})

void test("isSessionEnded uses endAt, else dayKey+slot+duration, and only once booked", () => {
  const end = Date.parse("2026-10-02T19:00:00+07:00")
  assert.equal(isSessionEnded(makeSession(), end - 1), false)
  assert.equal(isSessionEnded(makeSession(), end), true)
  assert.equal(
    isSessionEnded(
      makeSession({ endAt: "2026-10-03T10:00:00+07:00" }),
      end + 1
    ),
    false
  )
  assert.equal(
    isSessionEnded(
      makeSession({ status: "forming", reservationId: undefined }),
      end + 1
    ),
    false
  )
  assert.equal(isSessionEnded(makeSession({ status: "completed" }), 0), true)
})

void test("sessionParticipantIds: host + confirmed real members only", () => {
  assert.deepEqual(sessionParticipantIds("host-1", makeSession()), [
    "host-1",
    "user-an",
  ])
})

void test("toGroupMatch projects the fields members need", () => {
  const m = toGroupMatch(
    "host-1",
    makeSession(),
    Date.parse("2026-10-05T00:00:00+07:00")
  )
  assert.equal(m.sessionId, "s-1")
  assert.equal(m.hostUserId, "host-1")
  assert.equal(m.booked, true)
  assert.equal(m.ended, true)
  assert.deepEqual(m.participantIds, ["host-1", "user-an"])
})

void test("isGroupChannel: groups and rooms yes, DMs and venue chats no", () => {
  const few = { memberIds: ["a", "b"], isVenueChat: false }
  assert.equal(isGroupChannel("group-x", few), true)
  assert.equal(isGroupChannel("room-x", few), true)
  assert.equal(isGroupChannel("dm-x", few), false)
  assert.equal(
    isGroupChannel("venue-x", { memberIds: ["a", "b"], isVenueChat: true }),
    false
  )
  assert.equal(
    isGroupChannel("demo-ch1-u", {
      memberIds: ["a", "b", "c"],
      isVenueChat: false,
    }),
    true
  )
})

// ── RoomsService#groupMatch ─────────────────────────────────────────────────

function findOneChain(doc: unknown, record?: (filter: unknown) => void) {
  return (filter: unknown) => {
    record?.(filter)
    return { sort: () => ({ lean: () => Promise.resolve(doc) }) }
  }
}

async function makeRooms(
  findOne: (filter: unknown) => unknown,
  assertMember: (userId: string, channelId: string) => Promise<unknown> = () =>
    Promise.resolve({ createdBy: "host-1", memberIds: [], isVenueChat: false })
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RoomsService,
      { provide: getModelToken(PlaySession.name), useValue: { findOne } },
      { provide: NotificationsService, useValue: {} },
      { provide: ProfileService, useValue: {} },
      { provide: StreamService, useValue: { assertMember } },
      { provide: ClerkDirectoryService, useValue: {} },
      // Court-share collaborators — groupMatch never touches them.
      { provide: getModelToken(Booking.name), useValue: {} },
      { provide: getModelToken(RoomShare.name), useValue: {} },
      { provide: WalletService, useValue: {} },
      {
        provide: BookingsService,
        useValue: {
          refundDeclinedCancel: () => Promise.resolve(1),
        },
      },
      { provide: getModelToken(RoomComplaint.name), useValue: {} },
      RoomEventsService,
    ],
  }).compile()
  return moduleRef.get(RoomsService)
}

void test("groupMatch: a group with no linked session can be booked by its owner only", async () => {
  let filter: unknown
  const service = await makeRooms(findOneChain(null, (f) => (filter = f)))
  assert.deepEqual(await service.groupMatch("host-1", "group-abc"), {
    match: null,
    canBook: true,
  })
  assert.deepEqual(filter, {
    "data.chatChannelId": "group-abc",
    "data.status": { $ne: "cancelled" },
  })
  // Any other member waits for the owner.
  assert.deepEqual(await service.groupMatch("user-an", "group-abc"), {
    match: null,
    canBook: false,
  })
})

void test("groupMatch: a disbanded room's chat falls back to a match linked by chatChannelId, owner books", async () => {
  const filters: unknown[] = []
  const service = await makeRooms(findOneChain(null, (f) => filters.push(f)))
  const res = await service.groupMatch("host-1", "room-gone")
  assert.deepEqual(res, { match: null, canBook: true })
  assert.deepEqual(filters, [
    { sessionId: "gone" },
    { "data.chatChannelId": "room-gone", "data.status": { $ne: "cancelled" } },
  ])
  assert.equal(
    (await service.groupMatch("user-an", "room-gone")).canBook,
    false
  )
})

void test("groupMatch: chats nobody owns as a group (e.g. the seeded demo crew) can't be booked", async () => {
  const service = await makeRooms(findOneChain(null))
  assert.equal(
    (await service.groupMatch("host-1", "demo-ch1-host-1")).canBook,
    false
  )
})

void test("groupMatch: a room chat resolves its room by id", async () => {
  let filter: unknown
  const doc = { userId: "host-1", data: makeSession({ id: "r9" }) }
  const service = await makeRooms(findOneChain(doc, (f) => (filter = f)))
  const res = await service.groupMatch("user-an", "room-r9")
  assert.deepEqual(filter, { sessionId: "r9" })
  assert.equal(res.match?.sessionId, "r9")
  assert.equal(res.canBook, false)
})

void test("groupMatch: only the host may book a not-yet-booked match", async () => {
  const doc = {
    userId: "host-1",
    data: makeSession({ status: "forming", reservationId: undefined }),
  }
  const service = await makeRooms(findOneChain(doc))
  assert.equal((await service.groupMatch("host-1", "group-g")).canBook, true)
  assert.equal((await service.groupMatch("user-an", "group-g")).canBook, false)
})

void test("groupMatch rejects non-members", async () => {
  const service = await makeRooms(findOneChain(null), () =>
    Promise.reject(new ForbiddenException("nope"))
  )
  await assert.rejects(
    service.groupMatch("stranger", "group-g"),
    ForbiddenException
  )
})

// ── StreamService rename / add members ──────────────────────────────────────

function makeStreamClient(channel: {
  createdBy: string
  members: string[]
  venueId?: string
  missing?: boolean
}) {
  const calls = {
    updatePartial: [] as unknown[],
    addMembers: [] as string[][],
    upsertUsers: [] as unknown[],
  }
  const client = {
    key: "k",
    upsertUsers(users: unknown) {
      calls.upsertUsers.push(users)
      return Promise.resolve()
    },
    channel() {
      return {
        query() {
          if (channel.missing)
            return Promise.reject(
              Object.assign(new Error("not found"), { status: 404 })
            )
          return Promise.resolve({
            channel: {
              created_by: { id: channel.createdBy },
              ...(channel.venueId ? { venueId: channel.venueId } : {}),
            },
            members: channel.members.map((id) => ({ user_id: id })),
          })
        },
        updatePartial(update: unknown) {
          calls.updatePartial.push(update)
          return Promise.resolve()
        },
        addMembers(ids: string[]) {
          calls.addMembers.push(ids)
          return Promise.resolve()
        },
      }
    },
  }
  return { client, calls }
}

async function makeStream(
  client: ReturnType<typeof makeStreamClient>["client"],
  users: DirectoryUser[] = []
) {
  const byId = new Map(users.map((u) => [u.id, u]))
  const directory = {
    getMany: (ids: string[]) =>
      Promise.resolve(
        ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
      ),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      StreamService,
      { provide: STREAM_CLIENT, useValue: client },
      { provide: getModelToken(Venue.name), useValue: {} },
      { provide: getModelToken(Booking.name), useValue: {} },
      { provide: getModelToken(Brand.name), useValue: {} },
      { provide: ClerkDirectoryService, useValue: directory },
    ],
  }).compile()
  return moduleRef.get(StreamService)
}

void test("renameGroup: any member renames a group (trimmed)", async () => {
  const { client, calls } = makeStreamClient({
    createdBy: "owner",
    members: ["owner", "user-an", "user-bi"],
  })
  const service = await makeStream(client)
  await service.renameGroup("user-an", "group-g", "  Hội cầu lông  ")
  assert.deepEqual(calls.updatePartial, [{ set: { name: "Hội cầu lông" } }])
})

void test("renameGroup rejects non-members, DMs, venue chats and blank names", async () => {
  const group = await makeStream(
    makeStreamClient({ createdBy: "o", members: ["o", "a", "b"] }).client
  )
  await assert.rejects(
    group.renameGroup("x", "group-g", "N"),
    ForbiddenException
  )
  await assert.rejects(
    group.renameGroup("a", "group-g", "   "),
    BadRequestException
  )

  const dm = await makeStream(
    makeStreamClient({ createdBy: "a", members: ["a", "b"] }).client
  )
  await assert.rejects(dm.renameGroup("a", "dm-1", "N"), BadRequestException)

  const venue = await makeStream(
    makeStreamClient({ createdBy: "a", members: ["a", "b"], venueId: "v1" })
      .client
  )
  await assert.rejects(
    venue.renameGroup("a", "venue-1", "N"),
    BadRequestException
  )

  const missing = await makeStream(
    makeStreamClient({ createdBy: "a", members: [], missing: true }).client
  )
  await assert.rejects(
    missing.renameGroup("a", "group-g", "N"),
    NotFoundException
  )
})

void test("addGroupMembers: the creator adds new real users, skipping existing members", async () => {
  const { client, calls } = makeStreamClient({
    createdBy: "owner",
    members: ["owner", "user-an"],
  })
  const service = await makeStream(client, [{ id: "user-bi", name: "Bình" }])
  await service.addGroupMembers("owner", "group-g", ["user-an", "user-bi"])
  assert.deepEqual(calls.addMembers, [["user-bi"]])
  assert.equal(calls.upsertUsers.length, 1)
})

void test("addGroupMembers is creator-only, community-groups-only, capped and real-users-only", async () => {
  const mk = (members: string[]) =>
    makeStream(makeStreamClient({ createdBy: "owner", members }).client)

  await assert.rejects(
    (await mk(["owner", "a"])).addGroupMembers("a", "group-g", ["z"]),
    ForbiddenException
  )
  await assert.rejects(
    (await mk(["owner", "a"])).addGroupMembers("owner", "room-r", ["z"]),
    BadRequestException
  )
  const full = Array.from({ length: MAX_GROUP_MEMBERS }, (_, i) => `u${i}`)
  await assert.rejects(
    (await mk(["owner", ...full.slice(1)])).addGroupMembers(
      "owner",
      "group-g",
      ["new"]
    ),
    BadRequestException
  )
  await assert.rejects(
    (await mk(["owner"])).addGroupMembers("owner", "group-g", ["ghost"]),
    NotFoundException
  )
})
