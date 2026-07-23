// Pure helpers for the discounts feature — no Mongo/Nest DI, so these are
// unit-testable without a database (see test/discount-helpers.test.ts).

import { BadRequestException, NotFoundException } from "@nestjs/common"

import type { DiscountType } from "./discount-code.schema.js"

/** The fields `computeDiscount`/`assertDiscountApplicable` read off a code. */
export interface DiscountLike {
  code: string
  type: DiscountType
  value: number
  maxDiscount?: number
  minOrder?: number
  validFrom?: Date
  validUntil?: Date
  usageLimit?: number
  usedCount: number
  active: boolean
}

export interface ComputedDiscount {
  discountAmount: number
  finalAmount: number
}

/**
 * The pure percent/fixed math: how much `amount` (VND) is discounted by
 * `discount`, and what's left to charge. Percent discounts respect
 * `maxDiscount` when set; both kinds clamp so the discount never exceeds the
 * order (finalAmount never goes negative) and never drops below zero, and the
 * result is rounded to a whole VND (SePay/VND has no sub-unit).
 */
export function computeDiscount(
  discount: Pick<DiscountLike, "type" | "value" | "maxDiscount">,
  amount: number
): ComputedDiscount {
  const raw =
    discount.type === "percent"
      ? (amount * discount.value) / 100
      : discount.value
  const capped =
    discount.type === "percent" && discount.maxDiscount !== undefined
      ? Math.min(raw, discount.maxDiscount)
      : raw
  const discountAmount = Math.max(0, Math.min(Math.round(capped), amount))
  return { discountAmount, finalAmount: amount - discountAmount }
}

/** Compact VND label for an error message, e.g. `300_000` → `"300K"`. */
function compactVnd(amount: number): string {
  return amount % 1000 === 0 ? `${amount / 1000}K` : String(amount)
}

/**
 * Reject a discount code that can't be applied to `amount` right now — active
 * flag, validity window, usage limit, minimum order — all Vietnamese
 * user-facing messages (`AllExceptionsFilter` renders `{ error: message }`).
 * Shared by `DiscountsService#validate` (the `/validate` endpoint) and
 * `PaymentsService#checkout` (which re-validates the same code server-side
 * before charging), so both apply identical rules.
 */
export function assertDiscountApplicable(
  discount: DiscountLike,
  amount: number,
  now: Date
): void {
  // Inactive reads the same as unknown — a demo/retired code stays invisible
  // rather than surfacing an internal "why" to the caller.
  if (!discount.active) {
    throw new NotFoundException("Mã giảm giá không tồn tại")
  }
  if (discount.validFrom && now < discount.validFrom) {
    throw new BadRequestException("Mã giảm giá chưa có hiệu lực")
  }
  if (discount.validUntil && now > discount.validUntil) {
    throw new BadRequestException("Mã giảm giá đã hết hạn")
  }
  if (
    discount.usageLimit !== undefined &&
    discount.usedCount >= discount.usageLimit
  ) {
    throw new BadRequestException("Mã đã hết lượt sử dụng")
  }
  if (discount.minOrder !== undefined && amount < discount.minOrder) {
    throw new BadRequestException(
      `Đơn tối thiểu ${compactVnd(discount.minOrder)} để dùng mã này`
    )
  }
}
