import assert from "node:assert/strict"
import test from "node:test"

import { PlayerService } from "../src/features/players/player.service.js"

function chain<T>(rows: T[]) {
  const q = {
    select: () => q,
    lean: () => Promise.resolve(rows),
  }
  return q
}

function makeService(opts: {
  assessments: { userId: string; data?: unknown }[]
  profiles?: { userId: string; user?: { trust?: number } }[]
  clerkUsers: { id: string; name: string }[]
}) {
  const filters: unknown[] = []
  const assessmentModel = {
    find: (filter: unknown) => {
      filters.push(filter)
      return chain(opts.assessments)
    },
  }
  const profileModel = { find: () => chain(opts.profiles ?? []) }
  const directory = { getMany: () => Promise.resolve(opts.clerkUsers) }
  const service = new PlayerService(
    {} as never,
    assessmentModel as never,
    profileModel as never,
    directory as never
  )
  return { service, filters }
}

const assessed = (bucket: string) => ({
  results: { badminton: { bucket } },
})

void test("listRealPlayers returns assessed accounts that still exist in Clerk", async () => {
  const { service, filters } = makeService({
    assessments: [
      { userId: "u1", data: assessed("intermediate") },
      { userId: "ghost", data: assessed("beginner") },
      { userId: "no-level", data: {} },
    ],
    profiles: [{ userId: "u1", user: { trust: 90 } }],
    clerkUsers: [{ id: "u1", name: "Nguyen Van An" }],
  })
  const players = await service.listRealPlayers("me")
  assert.deepEqual(filters[0], { userId: { $ne: "me" } })
  assert.equal(players.length, 1)
  assert.deepEqual(
    {
      id: players[0].id,
      name: players[0].name,
      level: players[0].level,
      trust: players[0].trust,
      distanceKm: players[0].distanceKm,
    },
    {
      id: "u1",
      name: "Nguyen Van An",
      level: "intermediate",
      trust: 90,
      distanceKm: null,
    }
  )
})

void test("listRealPlayers is empty when nobody has taken the assessment", async () => {
  const { service } = makeService({ assessments: [], clerkUsers: [] })
  assert.deepEqual(await service.listRealPlayers(), [])
})
