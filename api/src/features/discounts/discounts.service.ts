import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
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
  /** Total redemptions allowed across all users; absent when unlimited. */
  usageLimit?: number
  /** Redemptions allowed per user; absent when unlimited. */
  perUserLimit?: number
}

/** One code as the admin panel sees it — `GET /api/admin/discounts`. */
export interface AdminDiscountRow {
  code: string
  type: DiscountCode["type"]
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
}

/**
 * Cross-field invariants on the *resulting* document shape — used by both
 * `createCode` and `updateCode` (a PATCH can flip `type`, so this always
 * validates the merged result, not just the patch). Vietnamese, user-facing
 * messages per the repo's error convention.
 */
function assertDiscountShape(d: {
  type: DiscountCode["type"]
  value: number
  maxDiscount?: number
  validFrom?: Date
  validUntil?: Date
}): void {
  if (d.type === "percent" && (d.value < 1 || d.value > 100)) {
    throw new BadRequestException("Giá trị phần trăm phải từ 1 đến 100")
  }
  if (d.type === "fixed" && d.maxDiscount !== undefined) {
    throw new BadRequestException("Giảm tối đa chỉ áp dụng cho mã phần trăm")
  }
  if (d.validFrom && d.validUntil && d.validFrom >= d.validUntil) {
    throw new BadRequestException(
      "Thời gian bắt đầu phải trước thời gian kết thúc"
    )
  }
}

/** Map a Mongoose discount doc to the admin panel's plain row shape. */
function toAdminRow(doc: DiscountCodeDocument): AdminDiscountRow {
  return {
    code: doc.code,
    type: doc.type,
    value: doc.value,
    maxDiscount: doc.maxDiscount,
    minOrder: doc.minOrder,
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    usageLimit: doc.usageLimit,
    perUserLimit: doc.perUserLimit,
    usedCount: doc.usedCount,
    active: doc.active,
    description: doc.description,
    createdAt: (doc as { createdAt?: Date }).createdAt,
  }
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
      usageLimit: found.usageLimit,
      perUserLimit: found.perUserLimit,
    }
  }

  /**
   * Increment `usedCount` for a code — called only once a payment is `paid`.
   * The limit lives in the filter so the check and the increment are one
   * atomic update: `"applied"` means the increment landed within the limit,
   * `"over_limit"` means the code was already exhausted when this settlement
   * arrived (validate-time check raced another checkout), `"missing"` means
   * the code no longer exists.
   */
  async applyUsage(
    code: string
  ): Promise<"applied" | "over_limit" | "missing"> {
    const normalized = code.trim().toUpperCase()
    const res = await this.discountModel.updateOne(
      {
        code: normalized,
        $or: [
          { usageLimit: { $exists: false } },
          { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
        ],
      },
      { $inc: { usedCount: 1 } }
    )
    if (res.modifiedCount > 0) return "applied"
    const exists = await this.discountModel.exists({ code: normalized })
    return exists ? "over_limit" : "missing"
  }

  /** Every discount code, oldest-created first — `GET /api/admin/discounts`. */
  async listAllAdmin(): Promise<AdminDiscountRow[]> {
    await this.ensureSeeded()
    const docs = await this.discountModel.find().sort({ createdAt: 1 })
    return docs.map(toAdminRow)
  }

  /**
   * Create a new code — `POST /api/admin/discounts`. `code` normalization
   * (trim/uppercase) is handled by the DTO and the schema's own
   * `uppercase`/`trim` prop options; `active` defaults `true` via the schema
   * when omitted.
   */
  async createCode(input: {
    code: string
    type: DiscountCode["type"]
    value: number
    maxDiscount?: number
    minOrder?: number
    validFrom?: Date
    validUntil?: Date
    usageLimit?: number
    perUserLimit?: number
    active?: boolean
    description: string
  }): Promise<AdminDiscountRow> {
    await this.ensureSeeded()
    assertDiscountShape(input)
    try {
      const doc = await this.discountModel.create({ ...input, usedCount: 0 })
      return toAdminRow(doc)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictException("Mã giảm giá đã tồn tại")
      }
      throw err
    }
  }

  /**
   * Patch an existing code — `PATCH /api/admin/discounts/:code`. Only keys
   * present in `patch` are applied (`undefined` means "leave unchanged");
   * `code` and `usedCount` are never patchable here (payments reference
   * codes by string — see the module docstring).
   */
  async updateCode(
    rawCode: string,
    patch: {
      type?: DiscountCode["type"]
      value?: number
      maxDiscount?: number
      minOrder?: number
      validFrom?: Date
      validUntil?: Date
      usageLimit?: number
      perUserLimit?: number
      active?: boolean
      description?: string
    }
  ): Promise<AdminDiscountRow> {
    await this.ensureSeeded()
    const code = rawCode.trim().toUpperCase()
    const doc = await this.discountModel.findOne({ code })
    if (!doc) throw new NotFoundException("Mã giảm giá không tồn tại")

    if (patch.type !== undefined) doc.type = patch.type
    if (patch.value !== undefined) doc.value = patch.value
    if (patch.maxDiscount !== undefined) doc.maxDiscount = patch.maxDiscount
    if (patch.minOrder !== undefined) doc.minOrder = patch.minOrder
    if (patch.validFrom !== undefined) doc.validFrom = patch.validFrom
    if (patch.validUntil !== undefined) doc.validUntil = patch.validUntil
    if (patch.usageLimit !== undefined) doc.usageLimit = patch.usageLimit
    if (patch.perUserLimit !== undefined) doc.perUserLimit = patch.perUserLimit
    if (patch.active !== undefined) doc.active = patch.active
    if (patch.description !== undefined) doc.description = patch.description

    assertDiscountShape({
      type: doc.type,
      value: doc.value,
      maxDiscount: doc.maxDiscount,
      validFrom: doc.validFrom,
      validUntil: doc.validUntil,
    })
    await doc.save()
    return toAdminRow(doc)
  }

  /**
   * Delete a code — `DELETE /api/admin/discounts/:code`. Refuses codes with
   * any redemptions (`usedCount > 0`): deleting one that already has paid
   * orders referencing it by string would let a later code recreated under
   * the same string inherit those old redemptions' counts. Deactivate
   * instead of deleting a used code.
   */
  async deleteCode(rawCode: string): Promise<void> {
    await this.ensureSeeded()
    const code = rawCode.trim().toUpperCase()
    const doc = await this.discountModel.findOne({ code })
    if (!doc) throw new NotFoundException("Mã giảm giá không tồn tại")
    if (doc.usedCount > 0) {
      throw new ConflictException(
        "Mã đã có lượt sử dụng — hãy tắt mã thay vì xoá"
      )
    }
    await this.discountModel.deleteOne({ code })
  }
}
