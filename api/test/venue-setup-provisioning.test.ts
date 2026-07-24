import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BadRequestException } from "@nestjs/common"

import { VenuesService } from "../src/features/venues/venues.service.js"
import { initialsOf } from "../src/shared/index.js"
import type {
  BranchInput,
  VenueSetupInput,
} from "../src/features/venues/venues.service.js"

/**
 * Plan 020: setup provisions a LIST of branches (chi nhánh) at once and drops
 * the courts step — a branch starts with zero courts, added afterwards on the
 * per-branch "Sân" screen. First-time setup names the brand from `brandName`
 * (falling back to the first branch's name) and requires a `managerName`;
 * add-branch (an account that already has a brand) reuses the first branch's
 * manager and leaves the brand's name untouched (mirroring
 * `BrandsService#ensureBrand`'s real idempotency). These tests mock
 * `VenuesService`'s Mongoose model + collaborators directly (no real
 * database), following venues-reservation-freeze.test.ts's DI-bypass style —
 * `venueModel` here is a small mutable in-memory store rather than one fixed
 * doc, since `provisionVenue` reads (`myBranches`, `distinct`), writes
 * (`create`), and re-reads (`findDoc`/`venueBundle`/`catalogCourts`) across a
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

function makeBranch(overrides: Partial<BranchInput> = {}): BranchInput {
  return {
    name: "Sân Cầu Lông Quận 7",
    ward: "Phường Tân Thuận",
    province: "Thành phố Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    ...overrides,
  }
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

void test("provisionVenue names the brand from brandName (not the branch name) on first-time setup", async () => {
  const { model } = makeVenueModel()
  const { mock: brands, getBrand } = makeBrandsMock(null)
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    brandName: "Hệ thống Sân ABC",
    managerName: "Nguyễn Văn A",
    branches: [makeBranch()],
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
    branches: [makeBranch()],
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
    branches: [
      makeBranch({
        name: "Chi nhánh 2",
        ward: "Phường Bến Nghé",
        openFrom: "07:00",
        openTo: "23:00",
      }),
    ],
  }

  const seed = await service.provisionVenue("u3", input)

  assert.equal(seed.info.manager.name, "Trần Thị B")
  assert.equal(getBrand()?.name, "Brand X")
})

void test("provisionVenue creates every branch in the list under the same brand, all carrying the resolved manager", async () => {
  const { model, store } = makeVenueModel()
  const { mock: brands, getBrand } = makeBrandsMock(null)
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    brandName: "Hệ thống Sân ABC",
    managerName: "Nguyễn Văn A",
    branches: [
      makeBranch({ name: "Chi nhánh Quận 7" }),
      makeBranch({ name: "Chi nhánh Quận 1", ward: "Phường Bến Nghé" }),
    ],
  }

  const seed = await service.provisionVenue("u4", input)

  assert.equal(getBrand()?.name, "Hệ thống Sân ABC")
  assert.equal(store.length, 2)
  assert.equal(seed.info.id, store[0].info.id)
  for (const doc of store) {
    assert.equal(doc.ownerId, "u4")
    assert.equal(
      (doc.info as unknown as { brandId?: string }).brandId,
      getBrand()?.id
    )
    assert.equal(doc.info.manager.name, "Nguyễn Văn A")
  }
  assert.deepEqual(
    store.map((d) => d.info.name),
    ["Chi nhánh Quận 7", "Chi nhánh Quận 1"]
  )
})

void test("a freshly provisioned branch (no courts, pending approval) is excluded from catalogCourts", async () => {
  const { model, store } = makeVenueModel()
  const { mock: brands } = makeBrandsMock(null)
  const service = makeService({ venueModel: model, brands })

  const input: VenueSetupInput = {
    brandName: "Hệ thống Sân ABC",
    managerName: "Nguyễn Văn A",
    branches: [makeBranch()],
  }

  await service.provisionVenue("u5", input)

  // Asserted directly against catalogCourts (not just the underlying flags)
  // since that's the actual discovery/AI-facing gate the empty-branch rule
  // relies on (see plan 020's "Current state" + STOP conditions).
  const catalog = await service.catalogCourts()
  assert.equal(catalog.length, 0)

  // The two conditions catalogCourts filters on, confirmed directly too: a
  // fresh branch starts pending approval and with zero courts.
  assert.equal(store.length, 1)
  assert.equal(store[0].approval, "pending")
  assert.deepEqual(
    (store[0].ops as unknown as { courts: unknown[] }).courts,
    []
  )
})
