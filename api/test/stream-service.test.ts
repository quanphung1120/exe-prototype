import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"
import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import {
  STREAM_CLIENT,
  StreamService,
  demoPlayerStreamId,
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

/** A fake server-side StreamChat client that records every interaction. */
function makeFakeClient() {
  const calls = {
    createToken: [] as string[],
    upsertUsers: [] as Array<Array<{ id: string; name?: string }>>,
    channels: [] as ChannelCall[],
    created: [] as string[],
    messages: [] as Array<{ id: string; user_id?: string; text?: string }>,
  }
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
    channel(type: string, id: string, data: ChannelCall["data"]) {
      calls.channels.push({ type, id, data })
      return {
        create() {
          calls.created.push(id)
          return Promise.resolve()
        },
        sendMessage(msg: { text?: string; user_id?: string }) {
          calls.messages.push({ id, ...msg })
          return Promise.resolve()
        },
      }
    },
  }
  return { client, calls }
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
