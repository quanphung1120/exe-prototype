import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"

import {
  ACTIVITY,
  NOTIFICATIONS,
  STATS,
  STREAK,
  USER,
} from "../src/data/player.js"
import { AssessmentService } from "../src/features/assessment/assessment.service.js"
import { CourtsService } from "../src/features/courts/courts.service.js"
import { PlayerService } from "../src/features/players/player.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { SeedService } from "../src/features/seed/seed.service.js"
import { SessionsService } from "../src/features/sessions/sessions.service.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import type { VenueSeed } from "../src/shared/index.js"

/**
 * Service-level tests for `SeedService#buildSeed` (Plan 007 part C): a
 * no-venue account must get the cheap, no-query `emptyBundle()` fallback
 * instead of the old always-on `activeBundle()` demo-venue read.
 */

function makeProfile() {
  return {
    user: USER,
    streak: STREAK,
    stats: STATS,
    rooms: [],
    bookings: [],
    activity: ACTIVITY,
    notifications: NOTIFICATIONS,
    accountType: null,
  }
}

interface Deps {
  workspace?: {
    brand: {
      id: string
      ownerId: string
      name: string
      initials: string
    } | null
    venues: { id: string }[]
  }
}

function makeService(deps: Deps = {}) {
  const workspace = deps.workspace ?? { brand: null, venues: [] }
  const venueBundleCalls: string[] = []
  const activeBundleCalls: number[] = []
  const emptyBundleCalls: number[] = []

  const emptyVenueSeed: VenueSeed = {
    info: {
      id: "",
      name: "",
      initials: "",
      district: "",
      city: "",
      sports: [],
      openFrom: "00:00",
      openTo: "24:00",
      rating: 0,
      reviews: 0,
      manager: { name: "", initials: "" },
      now: "2026-07-23T08:00:00+07:00",
    },
    stats: {
      occupancy: 0,
      occupancyDelta: 0,
      revenueToday: 0,
      revenueDelta: 0,
      bookingsToday: 0,
      bookingsDelta: 0,
      noShowRate: 0,
      noShowDelta: 0,
      newCustomers: 0,
      newCustomersDelta: 0,
      utilization: 0,
    },
    courts: [],
    reservations: [],
    refundQueue: [],
    customers: [],
    blocks: [],
    revenueSeries: [],
    sportMix: [],
    channelMix: [],
    peakHours: [],
    insights: [],
  }

  const venuesMock = {
    myWorkspace: () => Promise.resolve(workspace),
    venueBundle: (id: string) => {
      venueBundleCalls.push(id)
      return Promise.resolve(emptyVenueSeed)
    },
    activeBundle: () => {
      activeBundleCalls.push(1)
      return Promise.resolve(emptyVenueSeed)
    },
    emptyBundle: () => {
      emptyBundleCalls.push(1)
      return emptyVenueSeed
    },
  }
  const courtsMock = { listCourts: () => Promise.resolve([]) }
  const playersMock = { listPlayers: () => Promise.resolve([]) }
  const profilesMock = {
    getProfile: () => Promise.resolve(makeProfile()),
    defaultProfile: () => makeProfile(),
  }
  const sessionsMock = { listUserSessions: () => Promise.resolve([]) }
  const assessmentMock = { getUserAssessment: () => Promise.resolve(null) }

  return Test.createTestingModule({
    providers: [
      SeedService,
      { provide: CourtsService, useValue: courtsMock },
      { provide: PlayerService, useValue: playersMock },
      { provide: ProfileService, useValue: profilesMock },
      { provide: SessionsService, useValue: sessionsMock },
      { provide: VenuesService, useValue: venuesMock },
      { provide: AssessmentService, useValue: assessmentMock },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(SeedService),
      venueBundleCalls,
      activeBundleCalls,
      emptyBundleCalls,
    }))
}

void test("buildSeed uses the no-query emptyBundle fallback for a user with no venue", async () => {
  const { service, venueBundleCalls, activeBundleCalls, emptyBundleCalls } =
    await makeService({ workspace: { brand: null, venues: [] } })

  const seed = await service.buildSeed("user-no-venue")

  assert.deepEqual(venueBundleCalls, [])
  assert.deepEqual(activeBundleCalls, [])
  assert.deepEqual(emptyBundleCalls, [1])
  assert.deepEqual(seed.venue.reservations, [])
  assert.deepEqual(seed.venue.customers, [])
  assert.equal(seed.venues.length, 0)
  assert.equal(seed.activeVenueId, "")
})

void test("buildSeed uses the no-query emptyBundle fallback for an anonymous caller", async () => {
  const { service, venueBundleCalls, activeBundleCalls, emptyBundleCalls } =
    await makeService()

  const seed = await service.buildSeed(undefined)

  assert.deepEqual(venueBundleCalls, [])
  assert.deepEqual(activeBundleCalls, [])
  assert.deepEqual(emptyBundleCalls, [1])
  assert.deepEqual(seed.venue.reservations, [])
})

void test("buildSeed calls venueBundle (not the fallback) for a user with a venue", async () => {
  const { service, venueBundleCalls, activeBundleCalls, emptyBundleCalls } =
    await makeService({
      workspace: {
        brand: { id: "b1", ownerId: "user-1", name: "Brand", initials: "B" },
        venues: [{ id: "v1" }],
      },
    })

  const seed = await service.buildSeed("user-1")

  assert.deepEqual(venueBundleCalls, ["v1"])
  assert.deepEqual(activeBundleCalls, [])
  assert.deepEqual(emptyBundleCalls, [])
  assert.equal(seed.activeVenueId, "v1")
})
