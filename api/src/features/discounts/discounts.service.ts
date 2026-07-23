import { Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { isDuplicateKeyError, once } from "../../common/mongo-util.js"
import { INITIAL_DISCOUNTS } from "../../data/discounts.js"
import {
  DiscountCode,
  type DiscountCodeDocument,
} from "./discount-code.schema.js"
import {
  assertDiscountApplicable,
  computeDiscount,
} from "./discount.helpers.js"

/** `POST /api/discounts/validate` response, and what checkout applies. */
export interface DiscountValidation {
  valid: true
  code: string
  type: DiscountCode["type"]
  value: number
  description: string
  discountAmount: number
  finalAmount: number
}

// MongoDB-backed discount codes, seeded from `INITIAL_DISCOUNTS` the first
// time the collection is read empty (idempotent — same `once()` +
// duplicate-key-swallow pattern `VenuesService` uses for `INITIAL_VENUES`).
@Injectable()
export class DiscountsService {
  constructor(
    @InjectModel(DiscountCode.name)
    private readonly discountModel: Model<DiscountCodeDocument>
  ) {}

  private readonly ensureSeeded = once(async () => {
    if ((await this.discountModel.countDocuments()) > 0) return
    try {
      await this.discountModel.insertMany(
        INITIAL_DISCOUNTS.map((d) => ({ ...d, usedCount: 0, active: true })),
        { ordered: false }
      )
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
  })

  /**
   * Validate `rawCode` against `amount` and return the computed discount —
   * `POST /api/discounts/validate`, and reused verbatim by
   * `PaymentsService#checkout` to re-validate a code server-side before
   * charging. Throws (Vietnamese message) on any unmet rule; never mutates
   * `usedCount` — that only happens once a payment actually settles (see
   * `applyUsage`).
   */
  async validate(rawCode: string, amount: number): Promise<DiscountValidation> {
    await this.ensureSeeded()
    const code = rawCode.trim().toUpperCase()
    const found = await this.discountModel.findOne({ code })
    // An unknown code and an inactive one both read as "does not exist" (see
    // `assertDiscountApplicable`'s `active` check) — this only covers the
    // "never existed" case.
    if (!found) throw new NotFoundException("Mã giảm giá không tồn tại")
    assertDiscountApplicable(found, amount, new Date())
    const { discountAmount, finalAmount } = computeDiscount(found, amount)
    return {
      valid: true,
      code: found.code,
      type: found.type,
      value: found.value,
      description: found.description,
      discountAmount,
      finalAmount,
    }
  }

  /** Increment `usedCount` for a code — called only once a payment is `paid`. */
  async applyUsage(code: string): Promise<void> {
    await this.discountModel.updateOne(
      { code: code.trim().toUpperCase() },
      { $inc: { usedCount: 1 } }
    )
  }
}
