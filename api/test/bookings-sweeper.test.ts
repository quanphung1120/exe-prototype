import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"

import { SepayClient, type SepayOrderClient } from "../src/features/payments/sepay.client.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { SessionsService } from "../src/features/sessions/sessions.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import { addIsoMinutes, vnNowIso } from "../src/shared/helpers.js"
import type { Reservation } from "../src/shared/index.js"

/**
 * Phase 5 scheduler: `VenuesService.sweepReservations` is the whole state
 * machine `bookings.sweeper.ts` (the cron trigger) calls every minute. These
 * tests exercise the service method directly against a mocked Mongoose model
 * — same approach as `sessions-service.test.ts` — so every rule's guard,
 * idempotency and cross-surface side effects (session sync, notification,
 * gateway cancel via a fake `SepayOrderClient`) are pinned without a real DB
 * or a real gateway.
 */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "rv1",
    customer: { name: "Khách", initials: "K" },
    sport: "badminton",
    courtId: "v1c1",
    court: "Sân 1",
    dayKey: "2026-07-20",
    day: { en: "Today", vi: "Hôm nay" },
    start: "18:00",
    durationMin: 60,
    time: "18:00 – 19:00",
    party: 2,
    source: "app",
    status: "pending",
    price: 180000,
    noShowRisk: 10,
    isRegular: false,
    ...overrides,
  }
}

interface Recorder {
  sessionCalls: unknown[][]
  notifyCalls: unknown[][]
  cancelCalls: string[]
  saveCount: () => number
}

/**
 * One venue ("v1") holding the given reservations (mutated in place, so
 * assertions after `sweepReservations` read straight off the input array).
 * `confirmSlaMinutes` stands in for `BOOKING_CONFIRM_SLA_MINUTES`.
 */
async function makeService(
  reservations: Reservation[],
  opts: {
    confirmSlaMinutes?: number
    sepay?: SepayOrderClient
  } = {}
): Promise<{ service: VenuesService } & Recorder> {
  let saves = 0
  const doc = {
    ops: { reservations, courts: [], customers: [] },
    markModified: () => {},
    save: () => {
      saves++
      return Promise.resolve()
    },
  }
  const model = {
    countDocuments: () => Promise.resolve(1), // already seeded — skip insertMany
    find: () => ({
      select: () => ({
        lean: () => Promise.resolve([{ venueId: "v1" }]),
      }),
    }),
    findOne: () => Promise.resolve(doc),
  }

  const sessionCalls: unknown[][] = []
  const notifyCalls: unknown[][] = []
  const cancelCalls: string[] = []
  const sepay: SepayOrderClient = opts.sepay ?? {
    cancelOrder: (ref: string) => {
      cancelCalls.push(ref)
      return Promise.resolve()
    },
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      VenuesService,
      { provide: getModelToken(Venue.name), useValue: model },
      {
        provide: SessionsService,
        useValue: {
          applyReservationStatus: (...args: unknown[]) => {
            sessionCalls.push(args)
            return Promise.resolve()
          },
        },
      },
      {
        provide: ProfileService,
        useValue: {
          addNotification: (...args: unknown[]) => {
            notifyCalls.push(args)
            return Promise.resolve()
          },
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (_key: string, fallback?: unknown) =>
            opts.confirmSlaMinutes ?? fallback,
        },
      },
      { provide: SepayClient, useValue: sepay },
    ],
  }).compile()

  return {
    service: moduleRef.get(VenuesService),
    sessionCalls,
    notifyCalls,
    cancelCalls,
    saveCount: () => saves,
  }
}

// ── Rule 1: awaiting_payment → expired ──────────────────────────────────────

void test("sweepReservations expires an unpaid hold past holdExpiresAt and cancels the gateway order", async () => {
  const reservation = makeReservation({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
    userId: "u1",
    sessionId: "s1",
  })
  const { service, cancelCalls, sessionCalls, notifyCalls } =
    await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T10:00:01+07:00")

  assert.deepEqual(result, { expired: 1, autoConfirmed: 0, completed: 0 })
  assert.equal(reservation.status, "expired")
  assert.deepEqual(cancelCalls, ["rv1"])
  assert.equal(sessionCalls.length, 1)
  assert.equal(notifyCalls.length, 1)
  const [, item] = notifyCalls[0] as [string, { id: string }]
  assert.match(item.id, /^booking-expired-/)
})

void test("sweepReservations leaves an unpaid hold alone before it expires", async () => {
  const reservation = makeReservation({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
  })
  const { service, cancelCalls, saveCount } = await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T09:59:59+07:00")

  assert.equal(result.expired, 0)
  assert.equal(reservation.status, "awaiting_payment")
  assert.equal(cancelCalls.length, 0)
  assert.equal(saveCount(), 0) // nothing touched — no wasted write
})

// ── Rule 2: pending + paid → confirmed (silence = consent) ─────────────────

void test("sweepReservations auto-confirms a paid pending reservation past the confirm SLA", async () => {
  const reservation = makeReservation({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T10:00:00+07:00",
    userId: "u1",
    sessionId: "s1",
  })
  const { service, sessionCalls, notifyCalls } = await makeService([
    reservation,
  ])

  const result = await service.sweepReservations("2026-07-20T10:00:00+07:00")

  assert.deepEqual(result, { expired: 0, autoConfirmed: 1, completed: 0 })
  assert.equal(reservation.status, "confirmed")
  assert.equal(sessionCalls.length, 1)
  const [, , patch] = sessionCalls[0] as [string, string, { status: string }]
  assert.equal(patch.status, "confirmed")
  assert.equal(notifyCalls.length, 1)
  const [, item] = notifyCalls[0] as [string, { id: string; text: string }]
  assert.match(item.id, /^booking-auto-confirmed-/)
  assert.match(item.text, /tự động xác nhận/)
})

void test("sweepReservations does not auto-confirm a pending reservation that isn't marked paid", async () => {
  const reservation = makeReservation({
    status: "pending",
    paymentStatus: "awaiting",
    confirmDeadlineAt: "2026-07-20T09:00:00+07:00",
  })
  const { service } = await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T10:00:00+07:00")

  assert.equal(result.autoConfirmed, 0)
  assert.equal(reservation.status, "pending")
})

void test("sweepReservations does not auto-confirm before the SLA deadline", async () => {
  const reservation = makeReservation({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T10:30:00+07:00",
  })
  const { service } = await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T10:00:00+07:00")

  assert.equal(result.autoConfirmed, 0)
  assert.equal(reservation.status, "pending")
})

// ── Rule 3: checked-in → completed ──────────────────────────────────────────

void test("sweepReservations completes a checked-in reservation past its endAt", async () => {
  const reservation = makeReservation({
    status: "checked-in",
    endAt: "2026-07-20T19:00:00+07:00",
  })
  const { service } = await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T19:00:01+07:00")

  assert.deepEqual(result, { expired: 0, autoConfirmed: 0, completed: 1 })
  assert.equal(reservation.status, "completed")
})

void test("sweepReservations never touches no-show — it stays a manual venue action", async () => {
  const reservation = makeReservation({
    status: "confirmed",
    endAt: "2026-01-01T00:00:00+07:00", // long past, but "confirmed" has no clock rule
  })
  const { service } = await makeService([reservation])

  const result = await service.sweepReservations("2026-07-20T19:00:01+07:00")

  assert.deepEqual(result, { expired: 0, autoConfirmed: 0, completed: 0 })
  assert.equal(reservation.status, "confirmed")
})

// ── Idempotency ──────────────────────────────────────────────────────────────

void test("sweepReservations is idempotent — re-running over already-transitioned rows is a no-op", async () => {
  const reservation = makeReservation({
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T10:00:00+07:00",
    userId: "u1",
    sessionId: "s1",
  })
  const { service, cancelCalls, notifyCalls } = await makeService([
    reservation,
  ])
  const now = "2026-07-20T10:05:00+07:00"

  const first = await service.sweepReservations(now)
  const second = await service.sweepReservations(now)

  assert.equal(first.expired, 1)
  assert.equal(second.expired, 0)
  assert.equal(reservation.status, "expired")
  // The gateway cancel and the player notification each fire exactly once,
  // not once per sweep tick.
  assert.deepEqual(cancelCalls, ["rv1"])
  assert.equal(notifyCalls.length, 1)
})

void test("sweepReservations mixes independent rules across reservations in one pass", async () => {
  const expiring = makeReservation({
    id: "rv1",
    status: "awaiting_payment",
    holdExpiresAt: "2026-07-20T09:00:00+07:00",
  })
  const confirming = makeReservation({
    id: "rv2",
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: "2026-07-20T09:00:00+07:00",
  })
  const completing = makeReservation({
    id: "rv3",
    status: "checked-in",
    endAt: "2026-07-20T09:00:00+07:00",
  })
  const untouched = makeReservation({ id: "rv4", status: "confirmed" })
  const { service } = await makeService([
    expiring,
    confirming,
    completing,
    untouched,
  ])

  const result = await service.sweepReservations("2026-07-20T10:00:00+07:00")

  assert.deepEqual(result, { expired: 1, autoConfirmed: 1, completed: 1 })
  assert.equal(expiring.status, "expired")
  assert.equal(confirming.status, "confirmed")
  assert.equal(completing.status, "completed")
  assert.equal(untouched.status, "confirmed")
})

// ── Reservations with no linked player (walk-ins) ───────────────────────────

void test("sweepReservations transitions a walk-in (no linked user) without a cross-write or notification", async () => {
  const reservation = makeReservation({
    status: "checked-in",
    endAt: "2026-07-20T19:00:00+07:00",
    source: "walk-in",
    userId: undefined,
    sessionId: undefined,
  })
  const { service, sessionCalls, notifyCalls } = await makeService([
    reservation,
  ])

  const result = await service.sweepReservations("2026-07-20T19:30:00+07:00")

  assert.equal(result.completed, 1)
  assert.equal(reservation.status, "completed")
  assert.equal(sessionCalls.length, 0)
  assert.equal(notifyCalls.length, 0)
})

// ── Config: BOOKING_CONFIRM_SLA_MINUTES ─────────────────────────────────────

void test("sweepReservations respects a shortened confirm SLA from ConfigService", async () => {
  // The reservation's own confirmDeadlineAt already encodes the SLA at
  // creation time (see venues-service.test.ts for that wiring); this pins
  // that a *shorter* configured SLA doesn't retroactively change an
  // already-set deadline — the sweep only ever compares against `now`.
  const reservation = makeReservation({
    status: "pending",
    paymentStatus: "paid",
    confirmDeadlineAt: addIsoMinutes(vnNowIso(), 1),
  })
  const { service } = await makeService([reservation], {
    confirmSlaMinutes: 1,
  })

  const notYet = await service.sweepReservations(vnNowIso())
  assert.equal(notYet.autoConfirmed, 0)

  const after = await service.sweepReservations(
    addIsoMinutes(vnNowIso(), 2)
  )
  assert.equal(after.autoConfirmed, 1)
})
