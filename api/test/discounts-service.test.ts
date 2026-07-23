import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common"
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

// ── admin methods (listAllAdmin / createCode / updateCode / deleteCode) ─────
//
// A second fake model — the admin surface exercises `countDocuments` (seed
// check), `insertMany` (seed), `find().sort()`, `findOne`, `create` and
// `deleteOne`, none of which the `applyUsage` fake above scripts. Docs are
// plain objects with a recorded `save()`, matching the file's existing
// recording style.

interface FakeDiscountDoc {
  code: string
  type: "percent" | "fixed"
  value: number
  maxDiscount?: number
  minOrder?: number
  validFrom?: Date
  validUntil?: Date
  usageLimit?: number
  perUserLimit?: number
  usedCount: number
  active: boolean
  description: string
  createdAt?: Date
  save: () => Promise<void>
}

function makeFakeDoc(
  fields: Partial<FakeDiscountDoc> &
    Pick<FakeDiscountDoc, "code" | "type" | "value">,
  saveCalls: FakeDiscountDoc[] = []
): FakeDiscountDoc {
  const doc: FakeDiscountDoc = {
    usedCount: 0,
    active: true,
    description: "Test code",
    ...fields,
    save: () => {
      saveCalls.push(doc)
      return Promise.resolve()
    },
  }
  return doc
}

interface AdminFakeModelScript {
  countDocuments?: number
  findResult?: FakeDiscountDoc[]
  findOneResult?: FakeDiscountDoc | null
  createRejects?: Error
}

function makeFakeAdminModel(script: AdminFakeModelScript) {
  const calls = {
    insertMany: [] as unknown[][],
    findCount: 0,
    findOne: [] as Record<string, unknown>[],
    create: [] as Record<string, unknown>[],
    deleteOne: [] as Record<string, unknown>[],
  }
  const model = {
    countDocuments: () => Promise.resolve(script.countDocuments ?? 1),
    insertMany: (docs: unknown[]) => {
      calls.insertMany.push(docs)
      return Promise.resolve()
    },
    find: () => {
      calls.findCount++
      return { sort: () => Promise.resolve(script.findResult ?? []) }
    },
    findOne: (filter: Record<string, unknown>) => {
      calls.findOne.push(filter)
      return Promise.resolve(script.findOneResult ?? null)
    },
    create: (input: Record<string, unknown>) => {
      calls.create.push(input)
      if (script.createRejects !== undefined) {
        return Promise.reject(script.createRejects)
      }
      return Promise.resolve({ ...input, usedCount: 0 })
    },
    deleteOne: (filter: Record<string, unknown>) => {
      calls.deleteOne.push(filter)
      return Promise.resolve({ deletedCount: 1 })
    },
  }
  return { model, calls }
}

async function makeAdminService(script: AdminFakeModelScript) {
  const { model, calls } = makeFakeAdminModel(script)
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscountsService,
      { provide: getModelToken(DiscountCode.name), useValue: model },
    ],
  }).compile()
  return { service: moduleRef.get(DiscountsService), calls }
}

// ── listAllAdmin ─────────────────────────────────────────────────────────────

void test("listAllAdmin seeds an empty collection before reading", async () => {
  const { service, calls } = await makeAdminService({
    countDocuments: 0,
    findResult: [],
  })

  const rows = await service.listAllAdmin()

  assert.equal(calls.insertMany.length, 1)
  assert.equal(calls.findCount, 1)
  assert.deepEqual(rows, [])
})

// ── createCode ───────────────────────────────────────────────────────────────

void test("createCode rejects a percent value over 100", async () => {
  const { service, calls } = await makeAdminService({ countDocuments: 1 })

  await assert.rejects(
    () =>
      service.createCode({
        code: "BIG",
        type: "percent",
        value: 150,
        description: "desc",
      }),
    BadRequestException
  )
  assert.equal(calls.create.length, 0)
})

void test("createCode rejects maxDiscount on a fixed-type code", async () => {
  const { service, calls } = await makeAdminService({ countDocuments: 1 })

  await assert.rejects(
    () =>
      service.createCode({
        code: "FIX10",
        type: "fixed",
        value: 10_000,
        maxDiscount: 5_000,
        description: "desc",
      }),
    BadRequestException
  )
  assert.equal(calls.create.length, 0)
})

void test("createCode maps a duplicate-key error to ConflictException", async () => {
  const duplicateKeyError = Object.assign(new Error("E11000 duplicate key"), {
    code: 11000,
  })
  const { service } = await makeAdminService({
    countDocuments: 1,
    createRejects: duplicateKeyError,
  })

  await assert.rejects(
    () =>
      service.createCode({
        code: "GIAM10",
        type: "percent",
        value: 10,
        description: "desc",
      }),
    ConflictException
  )
})

// ── updateCode ───────────────────────────────────────────────────────────────

void test("updateCode 404s an unknown code and normalizes the lookup", async () => {
  const { service, calls } = await makeAdminService({
    countDocuments: 1,
    findOneResult: null,
  })

  await assert.rejects(
    () => service.updateCode("  giam10  ", { description: "x" }),
    NotFoundException
  )
  assert.equal(calls.findOne.length, 1)
  assert.equal(calls.findOne[0]?.code, "GIAM10")
})

void test("updateCode validates the resulting shape when flipping type", async () => {
  const saveCalls: FakeDiscountDoc[] = []
  const existing = makeFakeDoc(
    {
      code: "GIAM10",
      type: "percent",
      value: 10,
      maxDiscount: 50_000,
      usedCount: 2,
      description: "desc",
    },
    saveCalls
  )
  const { service } = await makeAdminService({
    countDocuments: 1,
    findOneResult: existing,
  })

  await assert.rejects(
    () => service.updateCode("GIAM10", { type: "fixed" }),
    BadRequestException
  )
  assert.equal(saveCalls.length, 0)
})

void test("updateCode never changes code or usedCount", async () => {
  const saveCalls: FakeDiscountDoc[] = []
  const existing = makeFakeDoc(
    {
      code: "GIAM10",
      type: "percent",
      value: 10,
      usedCount: 4,
      description: "old",
    },
    saveCalls
  )
  const { service } = await makeAdminService({
    countDocuments: 1,
    findOneResult: existing,
  })

  const row = await service.updateCode("GIAM10", { description: "x" })

  assert.equal(saveCalls.length, 1)
  assert.equal(row.code, "GIAM10")
  assert.equal(row.usedCount, 4)
  assert.equal(row.description, "x")
})

// ── deleteCode ───────────────────────────────────────────────────────────────

void test("deleteCode refuses a code with redemptions", async () => {
  const existing = makeFakeDoc({
    code: "GIAM10",
    type: "percent",
    value: 10,
    usedCount: 3,
    description: "d",
  })
  const { service, calls } = await makeAdminService({
    countDocuments: 1,
    findOneResult: existing,
  })

  await assert.rejects(() => service.deleteCode("GIAM10"), ConflictException)
  assert.equal(calls.deleteOne.length, 0)
})

void test("deleteCode deletes an unused code", async () => {
  const existing = makeFakeDoc({
    code: "GIAM10",
    type: "percent",
    value: 10,
    usedCount: 0,
    description: "d",
  })
  const { service, calls } = await makeAdminService({
    countDocuments: 1,
    findOneResult: existing,
  })

  await service.deleteCode("  giam10 ")

  assert.equal(calls.deleteOne.length, 1)
  assert.equal(calls.deleteOne[0]?.code, "GIAM10")
})
