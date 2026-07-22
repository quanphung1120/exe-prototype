import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BrandsService } from "../src/features/brands/brands.service.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import { initialsOf } from "../src/shared/index.js"

/**
 * The brand/branch model (an account's brand owns many venue branches):
 * `BrandsService.ensureBrand` is idempotent per account, and
 * `VenuesService.assertOwnsVenue` authorizes a branch against its caller. Both
 * are constructed directly with narrowly-mocked models (no real database),
 * matching venues-reservation-freeze.test.ts's DI-bypass style.
 */

type BrandsCtorArgs = ConstructorParameters<typeof BrandsService>
type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

// A brand model that reports the account's existing brand (or none), and records
// any created doc so a test can assert the create path ran (or didn't).
function makeBrandModel(existing: unknown) {
  const created: unknown[] = []
  const model = {
    findOne: () => ({ lean: () => Promise.resolve(existing) }),
    distinct: () => Promise.resolve([] as string[]),
    create: (doc: unknown) => {
      created.push(doc)
      return Promise.resolve(doc)
    },
  }
  return { model, created }
}

void test("ensureBrand returns the account's existing brand without creating one", async () => {
  const { model, created } = makeBrandModel({
    info: { id: "b1", ownerId: "u1", name: "Shuttle Republic", initials: "SR" },
  })
  const brands = new BrandsService(...([model] as unknown as BrandsCtorArgs))

  const brand = await brands.ensureBrand("u1", { name: "Ignored New Name" })

  assert.equal(brand.id, "b1")
  assert.equal(brand.name, "Shuttle Republic")
  assert.equal(created.length, 0)
})

void test("ensureBrand mints a b<n> brand for a first-time account", async () => {
  const { model, created } = makeBrandModel(null)
  const brands = new BrandsService(...([model] as unknown as BrandsCtorArgs))

  const brand = await brands.ensureBrand("u1", { name: "Smash Arena" })

  assert.equal(brand.id, "b1")
  assert.equal(brand.ownerId, "u1")
  assert.equal(brand.initials, initialsOf("Smash Arena"))
  assert.equal(created.length, 1)
})

// A venue model that resolves `assertOwnsVenue`'s lookup to the given doc.
function makeVenuesService(
  venueDoc: { ownerId?: string } | null
): VenuesService {
  const venueModel = {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1), // already seeded
    findOne: () => ({
      select: () => ({ lean: () => Promise.resolve(venueDoc) }),
    }),
  }
  return new VenuesService(
    ...([venueModel, {}, {}, {}, {}, {}] as unknown as VenuesCtorArgs)
  )
}

void test("assertOwnsVenue resolves when the caller owns the branch", async () => {
  const service = makeVenuesService({ ownerId: "u1" })
  await service.assertOwnsVenue("u1", "v1") // does not throw
})

void test("assertOwnsVenue forbids another account's branch", async () => {
  const service = makeVenuesService({ ownerId: "u2" })
  await assert.rejects(
    () => service.assertOwnsVenue("u1", "v1"),
    /do not manage this venue/
  )
})

void test("assertOwnsVenue 404s an unknown branch", async () => {
  const service = makeVenuesService(null)
  await assert.rejects(
    () => service.assertOwnsVenue("u1", "vX"),
    /Venue not found/
  )
})
