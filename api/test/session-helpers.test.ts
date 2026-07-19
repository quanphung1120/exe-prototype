import assert from "node:assert/strict"
import { test } from "node:test"

import { buildSeedSessions, sessionToRoom } from "../src/shared/helpers.js"
import type { MatchRoom, PlaySession, User } from "../src/shared/index.js"
import { MATCH_SUGGESTIONS, ROOMS } from "../src/data/player.js"

/**
 * Phase 9 G1 (VienTD-Review): the fake matchmaking timers were removed, so
 * the seed ROOMS/MATCH_SUGGESTIONS liquidity is now marked `demo: true`
 * instead — this flag has to survive the MatchRoom → PlaySession → MatchRoom
 * round trip (`buildSeedSessions`/`sessionToRoom`) so the web can disable
 * Join on it. A real, user-created room must NOT pick up the flag.
 */

const USER: User = {
  name: "Test User",
  first: "Test",
  initials: "TU",
  handle: "@test",
  city: "Hà Nội",
  level: "intermediate",
  trust: 90,
}

function makeRoom(overrides: Partial<MatchRoom> = {}): MatchRoom {
  return {
    id: "r-fixture",
    host: { name: "Trần Huy", initials: "TH" },
    title: "Fixture room",
    sport: "badminton",
    format: "Doubles",
    venue: "Shuttle Republic",
    district: "Quận 1",
    distanceKm: 1.2,
    day: "Today",
    time: "18:30 – 19:30",
    level: "intermediate",
    capacity: 4,
    joined: 1,
    players: ["TH"],
    pricePerHour: 360000,
    ...overrides,
  }
}

void test("every seed ROOMS entry is marked demo: true", () => {
  assert.ok(ROOMS.length > 0)
  for (const r of ROOMS) assert.equal(r.demo, true, r.id)
})

void test("every seed MATCH_SUGGESTIONS entry is marked demo: true", () => {
  assert.ok(MATCH_SUGGESTIONS.length > 0)
  for (const p of MATCH_SUGGESTIONS) assert.equal(p.demo, true, p.id)
})

void test("buildSeedSessions carries a demo room's flag onto its session", () => {
  const sessions = buildSeedSessions(
    [makeRoom({ demo: true })],
    [],
    [],
    USER,
    [],
    "2026-07-20"
  )
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].demo, true)
})

void test("buildSeedSessions leaves a real (non-demo) room's session undemoed", () => {
  const sessions = buildSeedSessions(
    [makeRoom({ demo: undefined })],
    [],
    [],
    USER,
    [],
    "2026-07-20"
  )
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].demo, undefined)
})

void test("sessionToRoom projects the demo flag back onto the MatchRoom", () => {
  const demoSession: PlaySession = {
    id: "s-demo",
    title: "Demo session",
    sport: "pickleball",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2026-07-20",
    dayLabel: "Today",
    slot: "18:00",
    durationMin: 60,
    courtLabel: null,
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [{ name: "Host", initials: "HO", rsvp: "host" }],
    level: "any",
    status: "forming",
    listed: true,
    fillIntent: "find",
    venue: "Test Court",
    district: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    demo: true,
  }
  const room = sessionToRoom(demoSession)
  assert.equal(room.demo, true)

  const realRoom = sessionToRoom({
    ...demoSession,
    id: "s-real",
    demo: undefined,
  })
  assert.equal(realRoom.demo, undefined)
})
