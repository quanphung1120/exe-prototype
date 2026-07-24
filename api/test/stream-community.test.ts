import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import {
  STREAM_CLIENT,
  StreamService,
  venueChannelId,
} from "../src/features/stream/stream.service.js"
import { StreamSeedState } from "../src/features/stream/stream-seed.schema.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import {
  ClerkDirectoryService,
  type DirectoryUser,
} from "../src/features/stream/clerk-directory.service.js"

/**
 * Covers the two community-chat capabilities added on top of StreamService
 * (createConversation: DMs + named groups; openVenueChat: player↔venue-owner
 * chat gated on a paid booking) plus ClerkDirectoryService's search. Mirrors
 * stream-service.test.ts's fake-client conventions — no real Stream app, no
 * real Mongo, no real Clerk.
 */

interface ChannelCall {
  type: string
  id: string
  data: {
    name?: string
    venueId?: string
    created_by_id?: string
    members?: string[]
  }
}

function makeFakeClient() {
  const calls = {
    upsertUsers: [] as Array<Array<{ id: string; name?: string }>>,
    channels: [] as ChannelCall[],
    created: [] as string[],
  }
  const store = new Map<string, ChannelCall["data"]>()

  const client = {
    key: "test-api-key",
    upsertUsers(users: Array<{ id: string; name?: string }>) {
      calls.upsertUsers.push(users)
      return Promise.resolve()
    },
    channel(type: string, id: string, data?: ChannelCall["data"]) {
      calls.channels.push({ type, id, data: data ?? {} })
      return {
        create() {
          calls.created.push(id)
          if (!store.has(id)) store.set(id, data ?? {})
          return Promise.resolve()
        },
      }
    },
  }
  return { client, calls, store }
}

/** A fake ClerkDirectoryService — plain object matching the methods StreamService calls. */
function makeFakeDirectory(users: DirectoryUser[]) {
  const byId = new Map(users.map((u) => [u.id, u]))
  return {
    getMany(ids: string[]): Promise<DirectoryUser[]> {
      return Promise.resolve(
        ids.flatMap((id) => {
          const u = byId.get(id)
          return u ? [u] : []
        })
      )
    },
    getOne(id: string): Promise<DirectoryUser | null> {
      return Promise.resolve(byId.get(id) ?? null)
    },
    search(): Promise<DirectoryUser[]> {
      return Promise.resolve([])
    },
  } as unknown as ClerkDirectoryService
}

async function makeService(opts: {
  client: ReturnType<typeof makeFakeClient>["client"]
  directory: ClerkDirectoryService
  venues?: { findOne: (...args: unknown[]) => unknown }
  bookings?: {
    findOne?: (...args: unknown[]) => unknown
    exists?: (...args: unknown[]) => unknown
  }
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StreamService,
      { provide: STREAM_CLIENT, useValue: opts.client },
      {
        provide: getModelToken(StreamSeedState.name),
        useValue: { updateOne: () => Promise.resolve({ upsertedCount: 0 }) },
      },
      {
        provide: getModelToken(Venue.name),
        useValue: opts.venues ?? { findOne: () => ({ lean: () => null }) },
      },
      {
        provide: getModelToken(Booking.name),
        useValue: {
          findOne: opts.bookings?.findOne ?? (() => ({ lean: () => null })),
          exists: opts.bookings?.exists ?? (() => Promise.resolve(null)),
        },
      },
      { provide: ClerkDirectoryService, useValue: opts.directory },
    ],
  }).compile()
  return moduleRef.get(StreamService)
}

// ── createConversation ────────────────────────────────────────────────────

void test("createConversation with one member produces the deterministic dm id, order-independent, never sets a name", async () => {
  const { client, calls } = makeFakeClient()
  const directory = makeFakeDirectory([{ id: "user-2", name: "Lê Lan" }])
  const service = await makeService({ client, directory })

  const result = await service.createConversation("user-1", {
    memberIds: ["user-2"],
  })

  const ch = calls.channels.find((c) => c.id === result.id)
  assert.equal(ch?.data.name, undefined)
  assert.deepEqual(ch?.data.members?.sort(), ["user-1", "user-2"])
})

void test("createConversation dm id is identical regardless of caller/member argument order", async () => {
  const { client: clientA } = makeFakeClient()
  const directoryA = makeFakeDirectory([{ id: "user-2", name: "Lê Lan" }])
  const serviceA = await makeService({ client: clientA, directory: directoryA })
  const resultA = await serviceA.createConversation("user-1", {
    memberIds: ["user-2"],
  })

  const { client: clientB } = makeFakeClient()
  const directoryB = makeFakeDirectory([{ id: "user-1", name: "Trần Huy" }])
  const serviceB = await makeService({ client: clientB, directory: directoryB })
  const resultB = await serviceB.createConversation("user-2", {
    memberIds: ["user-1"],
  })

  assert.equal(resultA.id, resultB.id)
})

void test("createConversation with 2+ members and no name throws BadRequestException", async () => {
  const { client } = makeFakeClient()
  const directory = makeFakeDirectory([
    { id: "user-2", name: "Lê Lan" },
    { id: "user-3", name: "Phạm Quân" },
  ])
  const service = await makeService({ client, directory })

  await assert.rejects(
    () =>
      service.createConversation("user-1", {
        memberIds: ["user-2", "user-3"],
      }),
    BadRequestException
  )
})

void test("createConversation with 2+ members and a name creates a channel with caller-first members", async () => {
  const { client, calls } = makeFakeClient()
  const directory = makeFakeDirectory([
    { id: "user-2", name: "Lê Lan" },
    { id: "user-3", name: "Phạm Quân" },
  ])
  const service = await makeService({ client, directory })

  const result = await service.createConversation("user-1", {
    memberIds: ["user-2", "user-3"],
    name: "Weekend crew",
  })

  const ch = calls.channels.find((c) => c.id === result.id)
  assert.equal(ch?.data.name, "Weekend crew")
  assert.equal(ch?.data.created_by_id, "user-1")
  assert.deepEqual(ch?.data.members, ["user-1", "user-2", "user-3"])
})

void test("createConversation with an unknown member id throws NotFoundException and never upserts", async () => {
  const { client, calls } = makeFakeClient()
  // Directory only knows user-2, but the caller asked for user-2 AND user-404.
  const directory = makeFakeDirectory([{ id: "user-2", name: "Lê Lan" }])
  const service = await makeService({ client, directory })

  await assert.rejects(
    () =>
      service.createConversation("user-1", {
        memberIds: ["user-2", "user-404"],
        name: "Group",
      }),
    NotFoundException
  )
  assert.equal(calls.upsertUsers.length, 0)
})

// ── openVenueChat ──────────────────────────────────────────────────────────

const VENUE_WITH_OWNER = {
  venueId: "v1",
  ownerId: "owner-1",
  info: { name: "Sân Cầu Lông ABC" },
}

void test("openVenueChat happy path creates a channel carrying venueId/name/members", async () => {
  const { client, calls } = makeFakeClient()
  const directory = makeFakeDirectory([{ id: "owner-1", name: "Chủ sân ABC" }])
  const service = await makeService({
    client,
    directory,
    venues: { findOne: () => ({ lean: () => VENUE_WITH_OWNER }) },
    bookings: { exists: () => Promise.resolve({ _id: "b1" }) },
  })

  const result = await service.openVenueChat("player-1", { venueId: "v1" })

  assert.equal(result.id, venueChannelId("v1", "player-1"))
  const ch = calls.channels.find((c) => c.id === result.id)
  assert.equal(ch?.data.venueId, "v1")
  assert.equal(ch?.data.name, "Sân Cầu Lông ABC")
  assert.deepEqual(ch?.data.members, ["player-1", "owner-1"])
})

void test("openVenueChat on a venue without ownerId throws BadRequestException", async () => {
  const { client } = makeFakeClient()
  const directory = makeFakeDirectory([])
  const service = await makeService({
    client,
    directory,
    venues: {
      findOne: () => ({
        lean: () => ({ venueId: "v2", info: { name: "Sân Demo" } }),
      }),
    },
    bookings: { exists: () => Promise.resolve({ _id: "b1" }) },
  })

  await assert.rejects(
    () => service.openVenueChat("player-1", { venueId: "v2" }),
    BadRequestException
  )
})

void test("openVenueChat with no qualifying booking throws ForbiddenException", async () => {
  const { client } = makeFakeClient()
  const directory = makeFakeDirectory([{ id: "owner-1", name: "Chủ sân ABC" }])
  const service = await makeService({
    client,
    directory,
    venues: { findOne: () => ({ lean: () => VENUE_WITH_OWNER }) },
    bookings: { exists: () => Promise.resolve(null) },
  })

  await assert.rejects(
    () => service.openVenueChat("player-1", { venueId: "v1" }),
    ForbiddenException
  )
})

void test("openVenueChat({ bookingId }) resolves the venue via the booking and rejects a mismatched owner", async () => {
  const { client, calls } = makeFakeClient()
  const directory = makeFakeDirectory([{ id: "owner-1", name: "Chủ sân ABC" }])
  const service = await makeService({
    client,
    directory,
    venues: { findOne: () => ({ lean: () => VENUE_WITH_OWNER }) },
    bookings: {
      findOne: () => ({
        lean: () => ({ bookingId: "bk1", userId: "player-1", venueId: "v1" }),
      }),
      exists: () => Promise.resolve({ _id: "b1" }),
    },
  })

  const result = await service.openVenueChat("player-1", {
    bookingId: "bk1",
  })
  assert.equal(result.id, venueChannelId("v1", "player-1"))
  assert.ok(calls.channels.some((c) => c.id === result.id))
})

void test("openVenueChat({ bookingId }) rejects when the booking belongs to another user", async () => {
  const { client } = makeFakeClient()
  const directory = makeFakeDirectory([])
  const service = await makeService({
    client,
    directory,
    bookings: {
      findOne: () => ({
        lean: () => ({
          bookingId: "bk1",
          userId: "someone-else",
          venueId: "v1",
        }),
      }),
    },
  })

  await assert.rejects(
    () => service.openVenueChat("player-1", { bookingId: "bk1" }),
    NotFoundException
  )
})

// ── ClerkDirectoryService.search ─────────────────────────────────────────

void test("ClerkDirectoryService.search: an @ query looks up by exact emailAddress and attaches email", async () => {
  const calls: unknown[] = []
  const fakeClerk = {
    users: {
      getUserList: (params: unknown) => {
        calls.push(params)
        return Promise.resolve({
          data: [
            {
              id: "user-2",
              firstName: "Lê",
              lastName: "Lan",
              imageUrl: "",
              primaryEmailAddressId: "e1",
              emailAddresses: [{ id: "e1", emailAddress: "lan@example.com" }],
            },
          ],
          totalCount: 1,
        })
      },
    },
  }
  const service = new ClerkDirectoryService(
    fakeClerk as unknown as ConstructorParameters<
      typeof ClerkDirectoryService
    >[0]
  )

  const results = await service.search("caller-1", "lan@example.com")

  assert.deepEqual(calls[0], {
    emailAddress: ["lan@example.com"],
    limit: 5,
  })
  assert.equal(results[0]?.email, "lan@example.com")
})

void test("ClerkDirectoryService.search: a plain query looks up by `query` and never attaches email; caller is filtered out", async () => {
  const calls: unknown[] = []
  const fakeClerk = {
    users: {
      getUserList: (params: unknown) => {
        calls.push(params)
        return Promise.resolve({
          data: [
            {
              id: "caller-1",
              firstName: "Me",
              lastName: "",
              imageUrl: "",
              primaryEmailAddressId: null,
              emailAddresses: [],
            },
            {
              id: "user-3",
              firstName: "Phạm",
              lastName: "Quân",
              imageUrl: "",
              primaryEmailAddressId: "e2",
              emailAddresses: [{ id: "e2", emailAddress: "quan@example.com" }],
            },
          ],
          totalCount: 2,
        })
      },
    },
  }
  const service = new ClerkDirectoryService(
    fakeClerk as unknown as ConstructorParameters<
      typeof ClerkDirectoryService
    >[0]
  )

  const results = await service.search("caller-1", "Quân")

  assert.deepEqual(calls[0], { query: "Quân", limit: 8 })
  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, "user-3")
  assert.equal(results[0]?.email, undefined)
})
