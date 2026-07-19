import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"

import { SepayClient } from "../src/features/payments/sepay.client.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { SessionsService } from "../src/features/sessions/sessions.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import { vnNowIso } from "../src/shared/helpers.js"

/**
 * Phase 5 wiring: an app booking's confirm-SLA clock (decision #5) has to
 * start somewhere — `createOrSyncAppReservation` is that somewhere. This pins
 * that a newly-created reservation is stamped "paid" (checkout is still
 * simulated client-side ahead of this call) with a `confirmDeadlineAt`
 * derived from `BOOKING_CONFIRM_SLA_MINUTES`, so `sweepReservations`
 * (bookings-sweeper.test.ts) has something real to act on.
 */
async function makeService(confirmSlaMinutes: number) {
  const court = {
    id: "v1c1",
    name: "Sân 1",
    sport: "badminton" as const,
    surface: "Thảm",
    state: "available" as const,
    utilToday: 0,
    pricePerHour: 120000,
  }
  const doc = {
    info: { openFrom: "06:00", openTo: "22:00" },
    ops: { reservations: [] as unknown[], courts: [court], customers: [] },
    reservationSeq: 0,
    markModified: () => {},
    save: () => Promise.resolve(),
  }
  const model = {
    countDocuments: () => Promise.resolve(1),
    findOne: () => Promise.resolve(doc),
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      VenuesService,
      { provide: getModelToken(Venue.name), useValue: model },
      { provide: SessionsService, useValue: {} },
      { provide: ProfileService, useValue: {} },
      {
        provide: ConfigService,
        useValue: {
          get: (_key: string, fallback?: unknown) =>
            confirmSlaMinutes ?? fallback,
        },
      },
      { provide: SepayClient, useValue: { cancelOrder: () => Promise.resolve() } },
    ],
  }).compile()

  return moduleRef.get(VenuesService)
}

void test("createOrSyncAppReservation stamps a new booking paid and starts the confirm-SLA clock", async () => {
  const service = await makeService(5)
  const before = vnNowIso()

  const reservation = await service.createOrSyncAppReservation("v1", {
    courtId: "v1c1",
    dayKey: "2026-07-20",
    start: "18:00",
    durationMin: 60,
    userId: "u1",
    sessionId: "s1",
    customerName: "Quan",
  })

  assert.equal(reservation.status, "pending")
  assert.equal(reservation.paymentStatus, "paid")
  assert.ok(reservation.confirmDeadlineAt)

  // confirmDeadlineAt ≈ now + 5 minutes (within a few seconds of test runtime).
  const deadlineMs = new Date(reservation.confirmDeadlineAt).getTime()
  const expectedMs = new Date(before).getTime() + 5 * 60_000
  assert.ok(
    Math.abs(deadlineMs - expectedMs) < 5_000,
    `confirmDeadlineAt ${reservation.confirmDeadlineAt} should be ~5min after ${before}`
  )
})
