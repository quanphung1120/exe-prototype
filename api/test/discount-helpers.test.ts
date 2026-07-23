import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BadRequestException, NotFoundException } from "@nestjs/common"

import {
  assertDiscountApplicable,
  computeDiscount,
  type DiscountLike,
} from "../src/features/discounts/discount.helpers.js"

/**
 * Pure-helper tests for the discounts feature: the percent/fixed math
 * (`computeDiscount`) and the applicability guard (`assertDiscountApplicable`)
 * both `DiscountsService#validate` and `PaymentsService#checkout` share.
 */

function makeDiscount(overrides: Partial<DiscountLike> = {}): DiscountLike {
  return {
    code: "GIAM10",
    type: "percent",
    value: 10,
    usedCount: 0,
    active: true,
    ...overrides,
  }
}

// ── computeDiscount ─────────────────────────────────────────────────────────

void test("computeDiscount: plain percent", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "percent", value: 10 },
    200_000
  )
  assert.equal(discountAmount, 20_000)
  assert.equal(finalAmount, 180_000)
})

void test("computeDiscount: percent capped by maxDiscount", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "percent", value: 20, maxDiscount: 100_000 },
    1_000_000
  )
  // 20% of 1,000,000 would be 200,000 — capped to 100,000.
  assert.equal(discountAmount, 100_000)
  assert.equal(finalAmount, 900_000)
})

void test("computeDiscount: percent under the cap is untouched", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "percent", value: 20, maxDiscount: 100_000 },
    300_000
  )
  assert.equal(discountAmount, 60_000)
  assert.equal(finalAmount, 240_000)
})

void test("computeDiscount: fixed amount", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "fixed", value: 50_000 },
    200_000
  )
  assert.equal(discountAmount, 50_000)
  assert.equal(finalAmount, 150_000)
})

void test("computeDiscount: fixed amount clamps at zero (never negative)", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "fixed", value: 50_000 },
    30_000
  )
  assert.equal(discountAmount, 30_000)
  assert.equal(finalAmount, 0)
})

void test("computeDiscount: rounds to a whole VND", () => {
  const { discountAmount, finalAmount } = computeDiscount(
    { type: "percent", value: 15 },
    100_001
  )
  // 15% of 100,001 = 15,000.15 → rounds to 15,000.
  assert.equal(discountAmount, 15_000)
  assert.equal(finalAmount, 85_001)
})

// ── assertDiscountApplicable ────────────────────────────────────────────────

void test("assertDiscountApplicable: passes a plain active code", () => {
  assert.doesNotThrow(() =>
    assertDiscountApplicable(makeDiscount(), 200_000, new Date())
  )
})

void test("assertDiscountApplicable: rejects an inactive code as not-found", () => {
  assert.throws(
    () =>
      assertDiscountApplicable(
        makeDiscount({ active: false }),
        200_000,
        new Date()
      ),
    NotFoundException
  )
})

void test("assertDiscountApplicable: rejects an expired code", () => {
  const discount = makeDiscount({ validUntil: new Date("2020-01-01") })
  assert.throws(
    () => assertDiscountApplicable(discount, 200_000, new Date("2026-07-22")),
    BadRequestException
  )
})

void test("assertDiscountApplicable: rejects a not-yet-valid code", () => {
  const discount = makeDiscount({ validFrom: new Date("2027-01-01") })
  assert.throws(
    () => assertDiscountApplicable(discount, 200_000, new Date("2026-07-22")),
    BadRequestException
  )
})

void test("assertDiscountApplicable: rejects a code that hit its usage limit", () => {
  const discount = makeDiscount({ usageLimit: 5, usedCount: 5 })
  assert.throws(
    () => assertDiscountApplicable(discount, 200_000, new Date()),
    BadRequestException
  )
})

void test("assertDiscountApplicable: rejects an order under minOrder", () => {
  const discount = makeDiscount({ minOrder: 300_000 })
  assert.throws(
    () => assertDiscountApplicable(discount, 200_000, new Date()),
    BadRequestException
  )
})

void test("assertDiscountApplicable: an order at exactly minOrder passes", () => {
  const discount = makeDiscount({ minOrder: 300_000 })
  assert.doesNotThrow(() =>
    assertDiscountApplicable(discount, 300_000, new Date())
  )
})
