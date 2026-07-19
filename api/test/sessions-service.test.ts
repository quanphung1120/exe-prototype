import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { SessionsService } from "../src/features/sessions/sessions.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * The `session.schema.ts` doc stores the whole client `PlaySession` under a
 * Mongoose `Mixed` field, so new fields (holdExpiresAt, rsvpAt — added for the
 * court-hold/expiry feature) need no schema migration: whatever the client
 * sends round-trips untouched. These tests pin that behavior against a mocked
 * Mongoose model via @nestjs/testing, independent of a real database.
 */
function makeSession(overrides: Partial<PlaySessionData> = {}): PlaySessionData {
  return {
    id: "s-1",
    title: "Test session",
    sport: "badminton",
    format: "Singles",
    courtId: "c1",
    dayKey: "today",
    dayLabel: "Today",
    slot: "18:00",
    durationMin: 60,
    courtLabel: "Court 1",
    host: { name: "Quan", initials: "Q" },
    capacity: 2,
    roster: [{ name: "Quan", initials: "Q", rsvp: "host" }],
    level: "any",
    status: "forming",
    listed: false,
    fillIntent: "court",
    venue: "Test Court",
    district: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    ...overrides,
  }
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>,
  venuesMock: Record<string, (...args: unknown[]) => unknown> = {
    // The booking→reservation cross-write resolves no owning venue by default,
    // so upsertSession's sync no-ops and the persistence tests stay isolated.
    findVenueByCourtId: () => Promise.resolve(null),
  }
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SessionsService,
      { provide: getModelToken(PlaySession.name), useValue: modelMock },
      { provide: VenuesService, useValue: venuesMock },
    ],
  }).compile()
  return moduleRef.get(SessionsService)
}

void test("upsertSession round-trips a new holdExpiresAt field untouched", async () => {
  let savedFilter: unknown
  let savedUpdate: unknown
  const service = await makeService({
    updateOne: (filter: unknown, update: unknown) => {
      savedFilter = filter
      savedUpdate = update
      return Promise.resolve({ acknowledged: true })
    },
  })

  const holdExpiresAt = Date.now() + 20 * 60 * 1000
  const session = makeSession({ holdExpiresAt })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.holdExpiresAt, holdExpiresAt)
  assert.deepEqual(savedFilter, { userId: "user-1", sessionId: "s-1" })
  assert.equal(
    (savedUpdate as { $set: { data: PlaySessionData } }).$set.data.holdExpiresAt,
    holdExpiresAt
  )
})

void test("upsertSession round-trips a roster entry's rsvpAt untouched", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const rsvpAt = Date.now()
  const session = makeSession({
    roster: [
      { name: "Quan", initials: "Q", rsvp: "host" },
      { name: "Huy", initials: "H", rsvp: "requested", rsvpAt },
    ],
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.roster[1]?.rsvpAt, rsvpAt)
})

void test("upsertSession clears holdExpiresAt when a session transitions to booked", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({
    status: "booked",
    hold: "confirmed",
    holdExpiresAt: undefined,
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.status, "booked")
  assert.equal(result.holdExpiresAt, undefined)
})

// ── Cross-surface: booking → reservation write-back ───────────────────────────

void test("upsertSession mirrors a booked vc* court into a venue reservation and writes the linkage back", async () => {
  const updates: unknown[] = []
  let syncedVenueId: string | undefined
  let syncedInput: { reservationId?: string; sessionId?: string } | undefined
  const service = await makeService(
    {
      updateOne: (filter: unknown, update: unknown) => {
        updates.push({ filter, update })
        return Promise.resolve({ acknowledged: true })
      },
    },
    {
      findVenueByCourtId: (courtId: unknown) =>
        Promise.resolve(courtId === "v9c1" ? "v9" : null),
      createOrSyncAppReservation: (venueId: unknown, input: unknown) => {
        syncedVenueId = venueId as string
        syncedInput = input as typeof syncedInput
        return Promise.resolve({ id: "rv-42" })
      },
    }
  )

  const session = makeSession({
    status: "booked",
    hold: "pending",
    courtId: "v9c1",
    dayKey: "today",
    slot: "18:00",
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(syncedVenueId, "v9")
  assert.equal(syncedInput?.sessionId, "s-1")
  // Linkage persisted back onto the session so the next PUT updates in place.
  assert.equal(result.venueId, "v9")
  assert.equal(result.reservationId, "rv-42")
  // Two writes: the initial upsert, then the write-back with the linkage.
  assert.equal(updates.length, 2)
})

void test("upsertSession passes an existing reservationId through for idempotent re-PUTs", async () => {
  let syncedInput: { reservationId?: string } | undefined
  const service = await makeService(
    {
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    {
      findVenueByCourtId: () => Promise.resolve("v9"),
      createOrSyncAppReservation: (_venueId: unknown, input: unknown) => {
        syncedInput = input as typeof syncedInput
        return Promise.resolve({ id: "rv-42" })
      },
    }
  )

  // A re-PUT of an already-linked session must carry its reservationId so the
  // venue updates that reservation in place rather than piling up duplicates.
  const session = makeSession({
    status: "booked",
    hold: "pending",
    courtId: "v9c1",
    venueId: "v9",
    reservationId: "rv-42",
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(syncedInput?.reservationId, "rv-42")
  assert.equal(result.reservationId, "rv-42")
})

// ── Cross-surface: reservation decision → player session ──────────────────────

void test("applyReservationStatus confirms the session on operator approval", async () => {
  let saved = false
  const data = makeSession({ status: "booked", hold: "pending" })
  const service = await makeService({
    findOne: () =>
      Promise.resolve({
        data,
        markModified: () => {},
        save: () => {
          saved = true
          return Promise.resolve()
        },
      }),
  })

  await service.applyReservationStatus("user-1", "s-1", { status: "confirmed" })

  assert.equal(data.status, "booked")
  assert.equal(data.hold, "confirmed")
  assert.equal(saved, true)
})

void test("applyReservationStatus cancels + refunds + records reason on decline", async () => {
  const data = makeSession({ status: "booked", hold: "pending" })
  const service = await makeService({
    findOne: () =>
      Promise.resolve({ data, markModified: () => {}, save: () => Promise.resolve() }),
  })

  await service.applyReservationStatus("user-1", "s-1", {
    status: "cancelled",
    reason: "Sân đang bảo trì",
  })

  assert.equal(data.status, "cancelled")
  assert.equal(data.hold, undefined)
  assert.equal(data.cancelReason, "Sân đang bảo trì")
  assert.equal(data.refunded, true)
})

void test("applyReservationStatus marks a no-show without a refund", async () => {
  const data = makeSession({ status: "booked", hold: "confirmed" })
  const service = await makeService({
    findOne: () =>
      Promise.resolve({ data, markModified: () => {}, save: () => Promise.resolve() }),
  })

  await service.applyReservationStatus("user-1", "s-1", { status: "no-show" })

  assert.equal(data.status, "cancelled")
  assert.equal(data.refunded, undefined)
  assert.ok(data.cancelReason?.includes("no-show"))
})

void test("applyReservationStatus no-ops when the session is gone", async () => {
  const service = await makeService({
    findOne: () => Promise.resolve(null),
  })
  await service.applyReservationStatus("user-1", "missing", { status: "confirmed" })
  // No throw = pass; a walk-in reservation with no linked session is fine.
})
