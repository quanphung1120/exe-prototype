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
 *
 * Phase 3 demoted `upsertSession` (`PUT /api/sessions/:id`) further to pure
 * room coordination: it no longer cross-writes a booking itself (that's now
 * `POST /api/bookings`, tested in bookings-service.test.ts) — it only
 * validates the room shape/hosted-room cap and strips the fields a linked
 * booking now exclusively owns.
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

/** A fake Mongoose `.find(...).select(...).lean()` chain resolving to `docs`. */
function selectChain(docs: unknown[]) {
  return { select: () => ({ lean: () => Promise.resolve(docs) }) }
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>,
  bookingsMock: Record<string, (...args: unknown[]) => unknown> = {
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

// ── Room-coordination guards (Phase 3 demotion) ─────────────────────────────

void test("upsertSession strips status/hold/cancelReason/refunded once linked to a booking", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  // A client can't spoof a venue decision (or a stale cancel/refund) through
  // a plain session PUT once the session is linked to a real booking — those
  // fields are derived at read time from the booking instead.
  const session = makeSession({
    status: "cancelled",
    hold: "pending",
    cancelReason: "spoofed",
    refunded: true,
    venueId: "v9",
    reservationId: "rv-42",
  })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.status, "booked")
  assert.equal(result.hold, undefined)
  assert.equal(result.cancelReason, undefined)
  assert.equal(result.refunded, undefined)
  // Non-booking-owned fields (the linkage itself, court/venue) pass through.
  assert.equal(result.venueId, "v9")
  assert.equal(result.reservationId, "rv-42")
})

void test("upsertSession leaves status/hold untouched for a session with no linked booking yet", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({ status: "cancelled", hold: undefined })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.status, "cancelled")
})

void test("upsertSession rejects a room over MAX_CAPACITY", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({ capacity: 9 })

  await assert.rejects(() => service.upsertSession("user-1", session))
})

void test("upsertSession rejects a roster larger than its capacity", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({
    capacity: 2,
    roster: [
      { name: "Quan", initials: "Q", rsvp: "host" },
      { name: "Huy", initials: "H", rsvp: "going" },
      { name: "Nam", initials: "N", rsvp: "going" },
    ],
  })

  await assert.rejects(() => service.upsertSession("user-1", session))
})

void test("upsertSession rejects a 4th active listed room (MAX_HOSTED_ROOMS)", async () => {
  const others = [
    { data: { listed: true, status: "forming" } },
    { data: { listed: true, status: "booked" } },
    { data: { listed: true, status: "forming" } },
  ]
  const service = await makeService({
    find: () => selectChain(others),
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({ id: "s-new", listed: true, status: "forming" })

  await assert.rejects(
    () => service.upsertSession("user-1", session),
    /tối đa 3 phòng/
  )
})

void test("upsertSession allows an active listed room under MAX_HOSTED_ROOMS", async () => {
  const others = [
    { data: { listed: true, status: "forming" } },
    // Cancelled/completed rooms and the session's own prior state don't count.
    { data: { listed: true, status: "cancelled" } },
  ]
  const service = await makeService({
    find: () => selectChain(others),
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({ id: "s-new", listed: true, status: "forming" })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.listed, true)
})

void test("upsertSession exempts an unlisted solo court hold from the hosted-room cap", async () => {
  const service = await makeService({
    find: () => {
      throw new Error("should not query the hosted-room count for listed:false")
    },
    updateOne: () => Promise.resolve({ acknowledged: true }),
  })

  const session = makeSession({ listed: false, status: "booked" })

  const result = await service.upsertSession("user-1", session)

  assert.equal(result.listed, false)
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
