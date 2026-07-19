import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { SessionsService } from "../src/features/sessions/sessions.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * The `session.schema.ts` doc stores the whole client `PlaySession` under a
 * Mongoose `Mixed` field, so new fields (holdExpiresAt, rsvpAt — added for the
 * court-hold/expiry feature) need no schema migration: whatever the client
 * sends round-trips untouched. These tests pin that behavior against a mocked
 * Mongoose model via @nestjs/testing, independent of a real database.
 *
 * Phase 2 moved the booking↔session cross-write from a two-way
 * SessionsService↔VenuesService `forwardRef` to a one-way dependency on
 * `BookingsService` (the canonical `bookings` collection); a linked session's
 * status/hold/refund is now *derived* at read time (`listUserSessions`) rather
 * than pushed by the venue side.
 */
function makeSession(
  overrides: Partial<PlaySessionData> = {}
): PlaySessionData {
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

/** A fake Mongoose `.find(...).sort(...).lean()` chain resolving to `docs`. */
function findChain(docs: unknown[]) {
  return { sort: () => ({ lean: () => Promise.resolve(docs) }) }
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>,
  bookingsMock: Record<string, (...args: unknown[]) => unknown> = {
    // The booking cross-write resolves no owning venue by default, so
    // upsertSession's sync no-ops and the persistence tests stay isolated.
    createOrSyncAppBooking: () => Promise.resolve(null),
    statusFor: () => Promise.resolve(new Map()),
  }
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SessionsService,
      { provide: getModelToken(PlaySession.name), useValue: modelMock },
      { provide: BookingsService, useValue: bookingsMock },
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
    (savedUpdate as { $set: { data: PlaySessionData } }).$set.data
      .holdExpiresAt,
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

// ── Cross-surface: booking → session write-back ────────────────────────────

void test("upsertSession mirrors a booked vc* court into a booking and writes the linkage back", async () => {
  const updates: unknown[] = []
  let syncedInput: { sessionId?: string; bookingId?: string } | undefined
  const service = await makeService(
    {
      updateOne: (filter: unknown, update: unknown) => {
        updates.push({ filter, update })
        return Promise.resolve({ acknowledged: true })
      },
    },
    {
      createOrSyncAppBooking: (input: unknown) => {
        syncedInput = input as typeof syncedInput
        return Promise.resolve({
          reservation: { id: "rv-42" },
          venueId: "v9",
        })
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

  assert.equal(syncedInput?.sessionId, "s-1")
  // Linkage persisted back onto the session so the next PUT updates in place.
  assert.equal(result.venueId, "v9")
  assert.equal(result.reservationId, "rv-42")
  // Two writes: the initial upsert, then the write-back with the linkage.
  assert.equal(updates.length, 2)
})

void test("upsertSession passes an existing reservationId through for idempotent re-PUTs", async () => {
  let syncedInput: { bookingId?: string } | undefined
  const service = await makeService(
    {
      updateOne: () => Promise.resolve({ acknowledged: true }),
    },
    {
      createOrSyncAppBooking: (input: unknown) => {
        syncedInput = input as typeof syncedInput
        return Promise.resolve({
          reservation: { id: "rv-42" },
          venueId: "v9",
        })
      },
    }
  )

  // A re-PUT of an already-linked session must carry its reservationId so the
  // booking updates in place rather than piling up duplicates.
  const session = makeSession({
    status: "booked",
    hold: "pending",
    courtId: "v9c1",
    venueId: "v9",
    reservationId: "rv-42",
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(syncedInput?.bookingId, "rv-42")
  assert.equal(result.reservationId, "rv-42")
})

// ── Cross-surface: linked booking status → derived session view ────────────

void test("listUserSessions derives the session status/hold from the linked booking", async () => {
  const data = makeSession({
    status: "booked",
    hold: "pending",
    reservationId: "rv-1",
  })
  const service = await makeService(
    { find: () => findChain([{ data }]) },
    {
      statusFor: () =>
        Promise.resolve(
          new Map([
            [
              "rv-1",
              { venueId: "v9", status: "confirmed", paymentStatus: "paid" },
            ],
          ])
        ),
    }
  )

  const [session] = await service.listUserSessions("user-1")

  assert.equal(session.status, "booked")
  assert.equal(session.hold, "confirmed")
})

void test("listUserSessions marks cancelled + refunded from a declined booking", async () => {
  const data = makeSession({
    status: "booked",
    hold: "pending",
    reservationId: "rv-1",
  })
  const service = await makeService(
    { find: () => findChain([{ data }]) },
    {
      statusFor: () =>
        Promise.resolve(
          new Map([
            [
              "rv-1",
              {
                venueId: "v9",
                status: "cancelled",
                paymentStatus: "refunded",
                declineReason: "Sân đang bảo trì",
              },
            ],
          ])
        ),
    }
  )

  const [session] = await service.listUserSessions("user-1")

  assert.equal(session.status, "cancelled")
  assert.equal(session.hold, undefined)
  assert.equal(session.cancelReason, "Sân đang bảo trì")
  assert.equal(session.refunded, true)
})

void test("listUserSessions marks a no-show booking without implying a refund", async () => {
  const data = makeSession({
    status: "booked",
    hold: "confirmed",
    reservationId: "rv-1",
  })
  const service = await makeService(
    { find: () => findChain([{ data }]) },
    {
      statusFor: () =>
        Promise.resolve(
          new Map([
            [
              "rv-1",
              { venueId: "v9", status: "no-show", paymentStatus: "paid" },
            ],
          ])
        ),
    }
  )

  const [session] = await service.listUserSessions("user-1")

  assert.equal(session.status, "cancelled")
  assert.equal(session.refunded, undefined)
  assert.ok(session.cancelReason?.includes("no-show"))
})

void test("listUserSessions leaves a session with no linked booking untouched", async () => {
  const data = makeSession({ status: "forming" })
  const service = await makeService(
    { find: () => findChain([{ data }]) },
    { statusFor: () => Promise.resolve(new Map()) }
  )

  const [session] = await service.listUserSessions("user-1")

  assert.deepEqual(session, data)
})
