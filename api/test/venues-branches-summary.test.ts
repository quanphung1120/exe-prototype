import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { VenuesService } from "../src/features/venues/venues.service.js"
import type { VenueCourt } from "../src/shared/index.js"

/**
 * Plan 021: `branchesSummary` is the Manage screen's cross-branch table data —
 * per branch, a non-archived court count and a state breakdown. Mirrors
 * venue-setup-provisioning.test.ts's DI-bypass style (mock `VenuesService`'s
 * Mongoose model + collaborators directly, no real database).
 */

type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

interface FakeVenueDoc {
  venueId: string
  ownerId?: string
  info: Record<string, unknown> & { id: string; name: string }
  ops: { courts: VenueCourt[] }
  approval?: string
  createdAt: Date
}

/** A minimal in-memory stand-in for the venue Mongoose model (reads only). */
function makeVenueModel(docs: FakeVenueDoc[]) {
  function matches(filter: Record<string, unknown>, doc: FakeVenueDoc) {
    return Object.entries(filter).every(
      ([k, v]) => (doc as unknown as Record<string, unknown>)[k] === v
    )
  }
  return {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(docs.length),
    find: (filter: Record<string, unknown> = {}) => ({
      sort: () => ({
        lean: () => Promise.resolve(docs.filter((d) => matches(filter, d))),
      }),
    }),
  }
}

function makeCourt(overrides: Partial<VenueCourt> = {}): VenueCourt {
  return {
    id: "vc1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Sàn gỗ",
    state: "available",
    utilToday: 0,
    pricePerHour: 100000,
    ...overrides,
  }
}

function makeService(venueModel: ReturnType<typeof makeVenueModel>) {
  const bookingsMock = {
    listForVenue: () => Promise.resolve([]),
    listRefundQueue: () => Promise.resolve([]),
    seedHistoricalBookings: () => Promise.resolve(),
  }
  const profilesMock = { getProfile: () => Promise.resolve({}) }
  const notificationsMock = { create: () => Promise.resolve() }
  const streamMock = {}
  const brandsMock = { myBrand: () => Promise.resolve(null), ensureBrand: () => Promise.resolve(null) }

  return new VenuesService(
    ...([
      venueModel,
      bookingsMock,
      profilesMock,
      notificationsMock,
      streamMock,
      brandsMock,
    ] as unknown as VenuesCtorArgs)
  )
}

void test("branchesSummary tallies non-archived courts by state per branch, excluding another owner's branches", async () => {
  const docs: FakeVenueDoc[] = [
    {
      venueId: "v1",
      ownerId: "u1",
      info: { id: "v1", name: "Chi nhánh Quận 7", ward: "Phường Tân Thuận", province: "TP. Hồ Chí Minh" },
      ops: {
        courts: [
          makeCourt({ id: "vc1", state: "available" }),
          makeCourt({ id: "vc2", state: "in-play" }),
          makeCourt({ id: "vc3", state: "maintenance", archived: true }),
        ],
      },
      approval: "approved",
      createdAt: new Date(0),
    },
    {
      venueId: "v2",
      ownerId: "u1",
      info: { id: "v2", name: "Chi nhánh Quận 1", ward: "Phường Bến Nghé", province: "TP. Hồ Chí Minh" },
      ops: { courts: [] },
      approval: "pending",
      createdAt: new Date(1),
    },
    {
      venueId: "v3",
      ownerId: "u2",
      info: { id: "v3", name: "Chi nhánh của người khác", ward: "Phường X", province: "TP. Hồ Chí Minh" },
      ops: { courts: [makeCourt({ id: "vc4", state: "available" })] },
      approval: "approved",
      createdAt: new Date(2),
    },
  ]
  const service = makeService(makeVenueModel(docs))

  const summary = await service.branchesSummary("u1")

  assert.equal(summary.length, 2)

  const [branch1, branch2] = summary
  assert.equal(branch1.venueId, "v1")
  assert.equal(branch1.courtCount, 2)
  assert.deepEqual(branch1.stateCounts, {
    available: 1,
    "in-play": 1,
    upcoming: 0,
    maintenance: 0,
  })
  assert.equal(branch1.approval, "approved")

  assert.equal(branch2.venueId, "v2")
  assert.equal(branch2.courtCount, 0)
  assert.deepEqual(branch2.stateCounts, {
    available: 0,
    "in-play": 0,
    upcoming: 0,
    maintenance: 0,
  })
  assert.equal(branch2.approval, "pending")
})
