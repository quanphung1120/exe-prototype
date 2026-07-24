import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BadRequestException } from "@nestjs/common"

import { VenuesService } from "../src/features/venues/venues.service.js"
import { initialsOf } from "../src/shared/index.js"
import type {
  CourtInput,
  VenueSetupInput,
} from "../src/features/venues/venues.service.js"

/**
 * Plan 018: `provisionVenue`'s Brand step vs. Branch step split. First-time
 * setup names the brand from `brandName` (falling back to the venue name) and
 * requires a `managerName`; add-branch (an account that already has a brand)
 * reuses the first branch's manager and leaves the brand's name untouched
 * (mirroring `BrandsService#ensureBrand`'s real idempotency). These tests
 * mock `VenuesService`'s Mongoose model + collaborators directly (no real
 * database), following venues-reservation-freeze.test.ts's DI-bypass style —
 * `venueModel` here is a small mutable in-memory store rather than one fixed
 * doc, since `provisionVenue` reads (`myBranches`, `distinct`), writes
 * (`create`), and re-reads (`findDoc`/`addCourt`/`venueBundle`) across a
 * single call.
 */

type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

interface FakeVenueDoc {
  venueId: string
  ownerId?: string
  info: Record<string, unknown> & {
    id: string
    manager: { name: string; initials: string }
  }
  ops: Record<string, unknown>
  approval?: string
  courtSeq?: number
  createdAt: Date
  markModified: (path: string) => void
  save: () => Promise<void>
}

/** A minimal in-memory stand-in for the venue Mongoose model. */
function makeVenueModel() {
  const store: FakeVenueDoc[] = []
  let clock = 0

  function matches(filter: Record<string, unknown>, doc: FakeVenueDoc) {
    return Object.entries(filter).every(
      ([k, v]) => (doc as unknown as Record<string, unknown>)[k] === v
    )
  }

  const model = {
    // Skip the seed-on-empty path entirely (matches admin.test.ts /
    // brands-and-scoping.test.ts's convention) — this test only cares about
    // the account-scoped provisioning flow, not the demo seed data.
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1),
    distinct: (field: string) =>
      Promise.resolve(
        store.map((d) => (d as unknown as Record<string, unknown>)[field])
      ),
    find: (filter: Record<string, unknown> = {}) => ({
      sort: () => ({
        lean: () =>
          Promise.resolve(store.filter((d) => matches(filter, d))),
      }),
    }),
    findOne: (filter: Record<string, unknown> = {}) => {
      const doc = () => store.find((d) => matches(filter, d)) ?? null
      return {
        lean: () => Promise.resolve(doc()),
        select: () => ({ lean: () => Promise.resolve(doc()) }),
        then: (
          resolve: (v: FakeVenueDoc | null) => unknown,
          reject?: (e: unknown) => unknown
        ) => Promise.resolve(doc()).then(resolve, reject),
      }
    },
    create: (input: Record<string, unknown>) => {
      const doc = {
        ...input,
        createdAt: new Date(clock++),
        markModified: () => {},
        save: () => Promise.resolve(),
      } as unknown as FakeVenueDoc
      store.push(doc)
      return Promise.resolve(doc)
    },
  }
  return { model, store }
}

/** A stateful `BrandsService` stand-in mirroring `ensureBrand`'s idempotency. */
function makeBrandsMock(
  initial: { id: string; ownerId: string; name: string } | null = null
) {
  let brand = initial
  const ensureCalls: { userId: string; name?: string }[] = []
  return {
    mock: {
      ensureBrand: (userId: string, input: { name?: string }) => {
        ensureCalls.push({ userId, name: input.name })
        if (brand) return Promise.resolve({ ...brand })
        brand = {
          id: "b1",
          ownerId: userId,
          name: input.name ?? "",
          initials: initialsOf(input.name ?? ""),
        } as { id: string; ownerId: string; name: string }
        return Promise.resolve({ ...brand })
      },
      myBrand: () => Promise.resolve(brand),
    },
    getBrand: () => brand,
    ensureCalls,
  }
}

function makeCourts(): CourtInput[] {
  return [
    { name: "Sân 1", sport: "badminton", surface: "Thảm PU", pricePerHour: 200_000 },
  ]
}

function makeService(opts: {
  venueModel: ReturnType<typeof makeVenueModel>["model"]
  brands: ReturnType<typeof makeBrandsMock>["mock"]
}): VenuesService {
  const bookingsMock = {
    listForVenue: () => Promise.resolve([]),
    listRefundQueue: () => Promise.resolve([]),
    seedHistoricalBookings: () => Promise.resolve(),
  }
  const profilesMock = { getProfile: () => Promise.resolve({}) }
  const notificationsMock = { create: () => Promise.resolve() }
  const streamMock = {}

  return new VenuesService(
    ...([
      opts.venueModel,
      bookingsMock,
      profilesMock,
      notificationsMock,
      streamMock,
      opts.brands,
    ] as unknown as VenuesCtorArgs)
  )
}

void test("provisionVenue names the brand from brandName (not the venue name) on first-time setup", async () => {
  const { model } = makeVenueModel()
  const { mock: brands, getBrand } = makeBrandsMock(null)
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    name: "Sân Cầu Lông Quận 7",
    ward: "Phường Tân Thuận",
    province: "Thành phố Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    brandName: "Hệ thống Sân ABC",
    managerName: "Nguyễn Văn A",
    courts: makeCourts(),
  }

  const seed = await service.provisionVenue("u1", input)

  assert.equal(getBrand()?.name, "Hệ thống Sân ABC")
  assert.equal(seed.info.manager.name, "Nguyễn Văn A")
})

void test("provisionVenue rejects first-time setup with no managerName", async () => {
  const { model } = makeVenueModel()
  const { mock: brands } = makeBrandsMock(null)
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    name: "Sân Cầu Lông Quận 7",
    ward: "Phường Tân Thuận",
    province: "Thành phố Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    courts: makeCourts(),
  }

  await assert.rejects(
    () => service.provisionVenue("u2", input),
    BadRequestException
  )
})

void test("provisionVenue on add-branch reuses the account's existing manager and leaves the brand name unchanged", async () => {
  const { model, store } = makeVenueModel()
  store.push({
    venueId: "v1",
    ownerId: "u3",
    info: {
      id: "v1",
      name: "Chi nhánh 1",
      manager: { name: "Trần Thị B", initials: initialsOf("Trần Thị B") },
    },
    ops: {},
    approval: "approved",
    createdAt: new Date(0),
    markModified: () => {},
    save: () => Promise.resolve(),
  })
  const { mock: brands, getBrand } = makeBrandsMock({
    id: "b1",
    ownerId: "u3",
    name: "Brand X",
  })
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    name: "Chi nhánh 2",
    ward: "Phường Bến Nghé",
    province: "Thành phố Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "07:00",
    openTo: "23:00",
    courts: makeCourts(),
  }

  const seed = await service.provisionVenue("u3", input)

  assert.equal(seed.info.manager.name, "Trần Thị B")
  assert.equal(getBrand()?.name, "Brand X")
})
