import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { DiscountCode } from "../src/features/discounts/discount-code.schema.js"
import { DiscountsService } from "../src/features/discounts/discounts.service.js"

/**
 * Service-level tests for `DiscountsService#applyUsage` — the atomic,
 * limit-gated `usedCount` increment called once a payment settles (Plan 003).
 * The fake model below never runs real Mongo query semantics; it just records
 * the filter/update `applyUsage` sends and lets each test script the
 * `updateOne`/`exists` results it wants back.
 */

interface FakeModelScript {
  updateOneResult: { modifiedCount: number }
  existsResult: { _id: string } | null
}

function makeFakeDiscountModel(script: FakeModelScript) {
  const updateOneCalls: {
    filter: Record<string, unknown>
    update: Record<string, unknown>
  }[] = []
  const existsCalls: Record<string, unknown>[] = []
  return {
    model: {
      updateOne: (
        filter: Record<string, unknown>,
        update: Record<string, unknown>
      ) => {
        updateOneCalls.push({ filter, update })
        return Promise.resolve(script.updateOneResult)
      },
      exists: (filter: Record<string, unknown>) => {
        existsCalls.push(filter)
        return Promise.resolve(script.existsResult)
      },
    },
    updateOneCalls,
    existsCalls,
  }
}

async function makeService(script: FakeModelScript) {
  const { model, updateOneCalls, existsCalls } = makeFakeDiscountModel(script)
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscountsService,
      { provide: getModelToken(DiscountCode.name), useValue: model },
    ],
  }).compile()
  return {
    service: moduleRef.get(DiscountsService),
    updateOneCalls,
    existsCalls,
  }
}

// ── applyUsage ───────────────────────────────────────────────────────────────

void test("applyUsage sends an atomic, limit-gated filter with the normalized code", async () => {
  const { service, updateOneCalls } = await makeService({
    updateOneResult: { modifiedCount: 1 },
    existsResult: null,
  })

  await service.applyUsage("  giam10  ")

  assert.equal(updateOneCalls.length, 1)
  const { filter, update } = updateOneCalls[0]
  assert.equal(filter.code, "GIAM10")
  assert.deepEqual(filter.$or, [
    { usageLimit: { $exists: false } },
    { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
  ])
  assert.deepEqual(update, { $inc: { usedCount: 1 } })
})

void test("applyUsage returns 'applied' when the guarded increment lands", async () => {
  const { service } = await makeService({
    updateOneResult: { modifiedCount: 1 },
    existsResult: null,
  })

  assert.equal(await service.applyUsage("GIAM10"), "applied")
})

void test("applyUsage returns 'over_limit' when the code exists but the filter didn't match (limit already hit)", async () => {
  const { service, existsCalls } = await makeService({
    updateOneResult: { modifiedCount: 0 },
    existsResult: { _id: "doc-1" },
  })

  assert.equal(await service.applyUsage("GIAM10"), "over_limit")
  assert.equal(existsCalls.length, 1)
  assert.equal(existsCalls[0]?.code, "GIAM10")
})

void test("applyUsage returns 'missing' when the code doesn't exist at all", async () => {
  const { service } = await makeService({
    updateOneResult: { modifiedCount: 0 },
    existsResult: null,
  })

  assert.equal(await service.applyUsage("NOPE"), "missing")
})
