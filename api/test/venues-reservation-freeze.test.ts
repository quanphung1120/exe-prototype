import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { VenuesService } from "../src/features/venues/venues.service.js"
import { roomChannelId } from "../src/features/stream/stream.service.js"
import type { BookingRecordStatus, Reservation } from "../src/shared/index.js"

/**
 * `updateReservationStatus` is the one place an operator's approve/decline/
 * cancel decision lands. Reservation mutation itself lives in
 * `BookingsService#updateStatus` (the canonical `bookings` collection) —
 * `VenuesService` only wraps that with the player notification + this Phase 8
 * addition, a best-effort freeze of the linked room's Stream chat on decline/
 * cancel. These tests pin that wrapper against a fully mocked
 * Bookings/Profile/Notifications/Stream collaborators, no real database or
 * Stream app.
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

type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

/**
 * Build a `VenuesService` whose `bookings.updateStatus` returns the given
 * reservation (post-transition) plus its pre-transition status and userId —
 * exactly the shape `BookingsService#updateStatus` resolves.
 */
function makeService(
  reservation: Reservation,
  opts: {
    prevStatus?: BookingRecordStatus
    userId?: string
    freezeChannelById?: (channelId: string) => Promise<void>
  } = {}
): VenuesService {
  const {
    prevStatus = "confirmed",
    userId = reservation.userId,
    freezeChannelById = () => Promise.resolve(),
  } = opts
  const venueModelMock = {
    countDocuments: () => Promise.resolve(1), // already seeded
  }
  const bookingsMock = {
    updateStatus: () => Promise.resolve({ reservation, prevStatus, userId }),
  }
  const profilesMock = {}
  const notificationsMock = { create: () => Promise.resolve() }
  const streamMock = { freezeChannelById }

  return new VenuesService(
    ...([
      venueModelMock,
      bookingsMock,
      profilesMock,
      notificationsMock,
      streamMock,
    ] as unknown as VenuesCtorArgs)
  )
}

void test("updateReservationStatus freezes the room chat when a confirmed booking is cancelled", async () => {
  const reservation = makeReservation({ status: "cancelled" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, {
    prevStatus: "confirmed",
    freezeChannelById: (channelId) => {
      freezeCalls.push(channelId)
      return Promise.resolve()
    },
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
  const reservation = makeReservation({ status: "cancelled" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, {
    prevStatus: "pending",
    freezeChannelById: (channelId) => {
      freezeCalls.push(channelId)
      return Promise.resolve()
    },
  })

  await service.updateReservationStatus("v1", "r1", "cancelled", "Trùng lịch")

  assert.deepEqual(freezeCalls, [roomChannelId("s1")])
})

void test("updateReservationStatus does not freeze on approve/check-in — only cancel", async () => {
  const reservation = makeReservation({ status: "confirmed" })
  const freezeCalls: string[] = []
  const service = makeService(reservation, {
    prevStatus: "pending",
    freezeChannelById: (channelId) => {
      freezeCalls.push(channelId)
      return Promise.resolve()
    },
  })

  await service.updateReservationStatus("v1", "r1", "confirmed")

  assert.deepEqual(freezeCalls, [])
})

void test("a chat freeze failure never fails the booking decision itself", async () => {
  const reservation = makeReservation({ status: "cancelled" })
  const service = makeService(reservation, {
    prevStatus: "confirmed",
    freezeChannelById: () => Promise.reject(new Error("Stream is down")),
  })

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
    status: "cancelled",
    userId: undefined,
    sessionId: undefined,
    source: "walk-in",
  })
  const freezeCalls: string[] = []
  const service = makeService(reservation, {
    prevStatus: "confirmed",
    userId: undefined,
    freezeChannelById: (channelId) => {
      freezeCalls.push(channelId)
      return Promise.resolve()
    },
  })

  await service.updateReservationStatus("v1", "r1", "cancelled", "Khách huỷ")

  assert.deepEqual(freezeCalls, [])
})
