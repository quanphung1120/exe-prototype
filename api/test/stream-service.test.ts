import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ForbiddenException, NotFoundException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"
import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import {
  STREAM_CLIENT,
  StreamService,
  demoPlayerStreamId,
  roomChannelId,
} from "../src/features/stream/stream.service.js"
import { StreamSeedState } from "../src/features/stream/stream-seed.schema.js"
import { ChannelBodyDto } from "../src/features/stream/stream.dto.js"

/** Mirror the global ValidationPipe: valid iff class-validator finds no errors. */
function channelBodyValid(input: unknown): boolean {
  const dto = plainToInstance(ChannelBodyDto, input)
  return validateSync(dto).length === 0
}

/**
 * StreamService signs per-user tokens and seeds each user's demo Stream data on
 * first authentication (gated by an atomic Mongo `$setOnInsert` upsert). These
 * tests pin that behavior against a fake StreamChat client (injected via the
 * STREAM_CLIENT token) and a mocked seed-state model — no real Stream app or
 * database. They mirror sessions-service.test.ts's @nestjs/testing conventions.
 */

interface ChannelCall {
  type: string
  id: string
  data: { name?: string; created_by_id?: string; members?: string[] }
}

/** Fake persisted state for one channel, enough to back host-authorization. */
interface FakeChannelState {
  createdBy?: string
  frozen: boolean
  members: Set<string>
}

/**
 * A fake server-side StreamChat client that records every interaction and
 * keeps just enough per-channel state (creator, members, frozen) to exercise
 * the real room-chat lifecycle's host-authorization and freeze behavior.
 */
function makeFakeClient() {
  const calls = {
    createToken: [] as string[],
    upsertUsers: [] as Array<Array<{ id: string; name?: string }>>,
    channels: [] as ChannelCall[],
    created: [] as string[],
    messages: [] as Array<{ id: string; user_id?: string; text?: string }>,
    addMembers: [] as Array<{ id: string; members: string[] }>,
    removeMembers: [] as Array<{ id: string; members: string[] }>,
    updatePartial: [] as Array<{ id: string; update: unknown }>,
  }
  const store = new Map<string, FakeChannelState>()

  const client = {
    key: "test-api-key",
    createToken(userId: string) {
      calls.createToken.push(userId)
      return `token-${userId}`
    },
    upsertUsers(users: Array<{ id: string; name?: string }>) {
      calls.upsertUsers.push(users)
      return Promise.resolve()
    },
    channel(type: string, id: string, data?: ChannelCall["data"]) {
      calls.channels.push({ type, id, data: data ?? {} })
      return {
        create() {
          calls.created.push(id)
          const existing = store.get(id)
          if (!existing) {
            store.set(id, {
              createdBy: data?.created_by_id,
              frozen: false,
              members: new Set(data?.members ?? []),
            })
          }
          return Promise.resolve()
        },
        query() {
          const s = store.get(id)
          if (!s) {
            const err = new Error("channel not found") as Error & {
              StatusCode?: number
            }
            err.StatusCode = 404
            return Promise.reject(err)
          }
          return Promise.resolve({
            channel: { created_by_id: s.createdBy, frozen: s.frozen },
          })
        },
        addMembers(members: string[]) {
          calls.addMembers.push({ id, members })
          const s = store.get(id)
          for (const m of members) s?.members.add(m)
          return Promise.resolve()
        },
        removeMembers(members: string[]) {
          calls.removeMembers.push({ id, members })
          const s = store.get(id)
          for (const m of members) s?.members.delete(m)
          return Promise.resolve()
        },
        updatePartial(update: { set?: { frozen?: boolean } }) {
          calls.updatePartial.push({ id, update })
          const s = store.get(id)
          if (s && update.set?.frozen) s.frozen = true
          return Promise.resolve()
        },
        sendMessage(msg: { text?: string; user_id?: string }) {
          calls.messages.push({ id, ...msg })
          return Promise.resolve()
        },
      }
    },
  }
  return { client, calls, store }
}

async function makeService(
  clientMock: ReturnType<typeof makeFakeClient>["client"],
  modelMock: { updateOne: (...args: unknown[]) => unknown }
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StreamService,
      { provide: STREAM_CLIENT, useValue: clientMock },
      { provide: getModelToken(StreamSeedState.name), useValue: modelMock },
    ],
  }).compile()
  return moduleRef.get(StreamService)
}

void test("issueToken returns { apiKey, token } and signs the user's token", async () => {
  const { client, calls } = makeFakeClient()
  // upsertedCount 0 → already seeded, so this exercises just the token path.
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })

  const result = await service.issueToken("user-1")

  assert.deepEqual(result, { apiKey: "test-api-key", token: "token-user-1" })
  assert.deepEqual(calls.createToken, ["user-1"])
})

void test("seeding runs only on the upsert that inserts (upsertedCount 1), never twice", async () => {
  const { client, calls } = makeFakeClient()
  let upsertedCount = 1
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount }),
  })

  // First call inserts the marker → seeds: users upserted once, 4 demo channels
  // ("Badminton Crew" + 3 DMs) created.
  await service.issueToken("user-2", "Nguyễn Minh", "avatar.png")
  assert.equal(calls.upsertUsers.length, 1)
  assert.equal(calls.channels.length, 4)
  assert.equal(calls.created.length, 4)

  // Second call: marker already present (upsertedCount 0) → no further Stream work.
  upsertedCount = 0
  await service.issueToken("user-2")
  assert.equal(calls.upsertUsers.length, 1)
  assert.equal(calls.channels.length, 4)
})

void test("ensureRoomChannel maps initials to demo ids and sets created_by_id", async () => {
  const { client, calls } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })

  const result = await service.ensureRoomChannel("user-3", {
    id: "room-x",
    name: "Room X",
    memberInitials: ["TH"],
  })

  assert.deepEqual(result, { id: "room-x" })

  // The mock player TH is upserted alongside the current user.
  const lastUpsert = calls.upsertUsers.at(-1)
  assert.ok(lastUpsert?.some((u) => u.id === "user-3"))
  assert.ok(
    lastUpsert?.some(
      (u) => u.id === demoPlayerStreamId("TH") && u.name === "Trần Huy"
    )
  )

  // The channel is created by the current user with both as members.
  const ch = calls.channels.find((c) => c.id === "room-x")
  assert.equal(ch?.data.created_by_id, "user-3")
  assert.deepEqual(ch?.data.members, ["user-3", "demo-player-th"])
})

// ── Real room-chat lifecycle (quyết định #13) ────────────────────────────

void test("createRoomChannel creates a channel with only the host as a member", async () => {
  const { client, calls, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })

  const result = await service.createRoomChannel("host-1", {
    id: roomChannelId("s1"),
    name: "Room S1",
  })

  assert.deepEqual(result, { id: "room-s1" })
  const ch = calls.channels.find((c) => c.id === "room-s1")
  assert.equal(ch?.data.created_by_id, "host-1")
  assert.deepEqual(ch?.data.members, ["host-1"])
  assert.deepEqual([...(store.get("room-s1")?.members ?? [])], ["host-1"])
})

void test("addRoomMember lets the host add a real member", async () => {
  const { client, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s2", name: "Room S2" })

  await service.addRoomMember("host-1", "room-s2", "user-2")

  assert.ok(store.get("room-s2")?.members.has("user-2"))
})

void test("addRoomMember rejects a non-host caller", async () => {
  const { client } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s3", name: "Room S3" })

  await assert.rejects(
    () => service.addRoomMember("intruder", "room-s3", "user-2"),
    ForbiddenException
  )
})

void test("removeRoomMember allows a member to remove themselves without being host", async () => {
  const { client, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s4", name: "Room S4" })
  await service.addRoomMember("host-1", "room-s4", "user-2")

  await service.removeRoomMember("user-2", "room-s4", "user-2")

  assert.equal(store.get("room-s4")?.members.has("user-2"), false)
})

void test("removeRoomMember requires the host to remove someone else (kick/decline)", async () => {
  const { client, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s5", name: "Room S5" })
  await service.addRoomMember("host-1", "room-s5", "user-2")

  await assert.rejects(
    () => service.removeRoomMember("user-2", "room-s5", "user-3"),
    ForbiddenException
  )
  // The host can still kick.
  await service.removeRoomMember("host-1", "room-s5", "user-2")
  assert.equal(store.get("room-s5")?.members.has("user-2"), false)
})

void test("freezeRoomChannel requires the host and marks the channel frozen", async () => {
  const { client, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s6", name: "Room S6" })

  await assert.rejects(
    () => service.freezeRoomChannel("intruder", "room-s6"),
    ForbiddenException
  )
  assert.equal(store.get("room-s6")?.frozen, false)

  await service.freezeRoomChannel("host-1", "room-s6")
  assert.equal(store.get("room-s6")?.frozen, true)
})

void test("freezeChannelById freezes without a caller to authorize (venue cancel hook)", async () => {
  const { client, store } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })
  await service.createRoomChannel("host-1", { id: "room-s7", name: "Room S7" })

  await service.freezeChannelById("room-s7")

  assert.equal(store.get("room-s7")?.frozen, true)
})

void test("a room-chat action against a never-created channel 404s as NotFoundException", async () => {
  const { client } = makeFakeClient()
  const service = await makeService(client, {
    updateOne: () => Promise.resolve({ upsertedCount: 0 }),
  })

  await assert.rejects(
    () => service.freezeRoomChannel("host-1", "room-never-existed"),
    NotFoundException
  )
})

void test("ChannelBodyDto rejects illegal channel-id characters", () => {
  assert.equal(
    channelBodyValid({ id: "room-ok_1", name: "Room", memberInitials: ["TH"] }),
    true
  )
  // Spaces and punctuation aren't allowed by the /^[\w-]{1,64}$/ id pattern.
  assert.equal(
    channelBodyValid({ id: "bad id!", name: "Room", memberInitials: [] }),
    false
  )
  // An empty id is rejected too.
  assert.equal(channelBodyValid({ id: "", name: "Room", memberInitials: [] }), false)
})
