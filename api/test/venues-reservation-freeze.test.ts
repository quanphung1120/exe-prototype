import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { VenuesService } from "../src/features/venues/venues.service.js"
import { roomChannelId } from "../src/features/stream/stream.service.js"
import type { Reservation } from "../src/shared/index.js"

/**
 * `updateReservationStatus` is the one place an operator's approve/decline/
 * cancel decision lands. These tests pin the Phase 8 addition — a decline or
 * cancel best-effort freezes the linked room's Stream chat — against a fully
 * mocked Mongoose venue doc + Sessions/Profile/Stream collaborators, no real
 * database or Stream app.
 *
 * `VenuesService` is constructed directly (bypassing `@nestjs/testing`'s DI
 * container, unlike sessions-service.test.ts) rather than via
 * `{ provide: ProfileService, useValue: ... }`: importing `ProfileService` as
 * a second, DI-token import alongside `VenuesService` (which already imports
 * it internally) trips a `tsx`/esbuild decorator-metadata quirk on
 * `profile.schema.ts`'s `@Prop() userId: string` (`CannotDetermineTypeError`)
 * that doesn't reproduce when `VenuesService` is imported alone or via the
 * app's real `nest build`. Calling the constructor directly needs no DI
 * tokens, so it sidesteps the quirk entirely.
 */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    customer: { name: "Quan", initials: "Q" },
    userId: "user-1",
    sessionId: "s1",
    sport: "badminton",
    court: "Court 1",
    day: { vi: "Hôm nay", en: "Today" },
    time: "18:00 – 19:00",
    party: 2,
    source: "app",
    status: "confirmed",
    price: 180000,
    noShowRisk: 5,
    isRegular: false,
    ...overrides,
  }
}

/** A fake Mongoose venue doc backing just the one reservation under test. */
function makeFakeDoc(reservation: Reservation) {
  return {
    ops: { reservations: [reservation] },
    markModified: () => {},
    save: () => Promise.resolve(),
  }
}

type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

function makeService(
  reservation: Reservation,
  freezeChannelById: (channelId: string) => Promise<void> = () =>
    Promise.resolve()
): VenuesService {
  const doc = makeFakeDoc(reservation)
  const venueModelMock = {
    countDocuments: () => Promise.resolve(1), // already seeded
    findOne: () => Promise.resolve(doc),
  }
  const sessionsMock = { applyReservationStatus: () => Promise.resolve() }
  const profilesMock = { addNotification: () => Promise.resolve() }
  const streamMock = { freezeChannelById }

  return new VenuesService(
    ...([venueModelMock, sessionsMock, profilesMock, streamMock] as unknown as VenuesCtorArgs)
  )
}

void test("updateReservationStatus freezes the room chat when a confirmed booking is cancelled", async () => {
  const reservation = makeReservation({ status: "confirmed" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, (channelId) => {
    freezeCalls.push(channelId)
    return Promise.resolve()
  })

  await service.updateReservationStatus(
    "v1",
    "r1",
    "cancelled",
    "Sân bảo trì đột xuất"
  )

  assert.deepEqual(freezeCalls, [roomChannelId("s1")])
})

void test("updateReservationStatus freezes on a pending decline (reason required) too", async () => {
  const reservation = makeReservation({ status: "pending" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, (channelId) => {
    freezeCalls.push(channelId)
    return Promise.resolve()
  })

  await service.updateReservationStatus("v1", "r1", "cancelled", "Trùng lịch")

  assert.deepEqual(freezeCalls, [roomChannelId("s1")])
})

void test("updateReservationStatus does not freeze on approve/check-in — only cancel", async () => {
  const reservation = makeReservation({ status: "pending" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, (channelId) => {
    freezeCalls.push(channelId)
    return Promise.resolve()
  })

  await service.updateReservationStatus("v1", "r1", "confirmed")

  assert.deepEqual(freezeCalls, [])
})

void test("a chat freeze failure never fails the booking decision itself", async () => {
  const reservation = makeReservation({ status: "confirmed" })
  const service = makeService(reservation, () =>
    Promise.reject(new Error("Stream is down"))
  )

  const result = await service.updateReservationStatus(
    "v1",
    "r1",
    "cancelled",
    "Sự cố kỹ thuật"
  )

  assert.equal(result.status, "cancelled")
})

void test("updateReservationStatus skips the freeze hook for walk-ins (no linked session)", async () => {
  const reservation = makeReservation({
    status: "confirmed",
    userId: undefined,
    sessionId: undefined,
    source: "walk-in",
  })
  const freezeCalls: string[] = []
  const service = makeService(reservation, (channelId) => {
    freezeCalls.push(channelId)
    return Promise.resolve()
  })

  await service.updateReservationStatus("v1", "r1", "cancelled", "Khách huỷ")

  assert.deepEqual(freezeCalls, [])
})
