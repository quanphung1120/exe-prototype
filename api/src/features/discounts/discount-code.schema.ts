import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

/** A discount's amount kind: a percent of the order, or a flat VND amount. */
export type DiscountType = "percent" | "fixed"

/**
 * One mã giảm giá (discount code) — validated against an order amount by
 * `DiscountsService#validate` and, on checkout, re-validated server-side and
 * applied to the SePay charge (`PaymentsService#checkout`). Seeded on first
 * read from `data/discounts.ts` (see `DiscountsService#ensureSeeded`, the same
 * pattern `VenuesService` uses for `INITIAL_VENUES`).
 */
@Schema({ timestamps: true })
export class DiscountCode {
  // Explicit `type: X` on every field (not inferred from the TS annotation)
  // since esbuild-based runners like tsx don't emit the design:type metadata
  // @Prop() needs — see the same note on booking.schema.ts/payment.schema.ts.
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string
  @Prop({ type: String, required: true }) type: DiscountType
  /** Percent (1–100) when `type === "percent"`, VND amount when `"fixed"`. */
  @Prop({ type: Number, required: true }) value: number
  /** VND cap on the computed discount — only meaningful for `"percent"`. */
  @Prop({ type: Number }) maxDiscount?: number
  /** Minimum order amount (VND) required to apply this code. */
  @Prop({ type: Number }) minOrder?: number
  @Prop({ type: Date }) validFrom?: Date
  @Prop({ type: Date }) validUntil?: Date
  /** Total redemptions allowed across all users; unlimited when unset. */
  @Prop({ type: Number }) usageLimit?: number
  /** Max redemptions a single user may make of this code; unlimited when unset. */
  @Prop({ type: Number }) perUserLimit?: number
  @Prop({ type: Number, required: true, default: 0 }) usedCount: number
  @Prop({ type: Boolean, required: true, default: true }) active: boolean
  /** Vietnamese, user-facing label shown wherever the code is applied. */
  @Prop({ type: String, required: true }) description: string
}

export type DiscountCodeDocument = HydratedDocument<DiscountCode>
export const DiscountCodeSchema = SchemaFactory.createForClass(DiscountCode)
