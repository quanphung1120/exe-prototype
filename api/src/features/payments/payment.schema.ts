import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

/** Lifecycle of a `Payment` doc — SePay's side of a booking's checkout. */
export type PaymentRecordStatus = "awaiting" | "paid" | "cancelled"

/**
 * One SePay checkout per booking — `invoiceNumber` (== the booking's id) is
 * both SePay's idempotency key for the outbound checkout form and this
 * collection's, so a re-POST of `/payments/checkout` for the same booking
 * upserts the same doc instead of creating a duplicate order, and a replayed
 * IPN for the same `invoiceNumber` can only move `awaiting → paid` once (the
 * `findOneAndUpdate({invoiceNumber, status: "awaiting"}, ...)` in
 * `payments.service.ts` no-ops on every replay after the first).
 */
@Schema({ timestamps: true, minimize: false, optimisticConcurrency: true })
export class Payment {
  // Explicit `type: X` on every field (not inferred from the TS annotation)
  // since esbuild-based runners like tsx don't emit the design:type metadata
  // @Prop() needs — see test/payments-service.test.ts and the same note on
  // booking.schema.ts.
  @Prop({ type: String, required: true, unique: true }) invoiceNumber: string
  @Prop({ type: String, required: true, unique: true }) bookingId: string
  @Prop({ type: String, required: true }) venueId: string
  @Prop({ type: String }) userId?: string
  /** The amount actually charged — booking price minus any discount applied. */
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: String, required: true, default: "VND" }) currency: string
  @Prop({ type: String, required: true }) status: PaymentRecordStatus
  @Prop({ type: String }) checkoutUrl?: string
  @Prop({ type: String }) paidAt?: string
  /** The booking's undiscounted price — only set when a discount code was applied. */
  @Prop({ type: Number }) originalAmount?: number
  /** The mã giảm giá applied at checkout, uppercased, if any. */
  @Prop({ type: String }) discountCode?: string
  /** VND amount `discountCode` knocked off `originalAmount` to reach `amount`. */
  @Prop({ type: Number }) discountAmount?: number
  /** The raw IPN payload that marked this paid — kept for reconciliation/audit. */
  @Prop({ type: MongooseSchema.Types.Mixed }) ipnPayload?: unknown
}

export type PaymentDocument = HydratedDocument<Payment>
export const PaymentSchema = SchemaFactory.createForClass(Payment)

// One payment per booking; `bookingId`/`invoiceNumber` are already unique via
// their @Prop options above — the checkout upsert and the IPN's idempotent
// findOneAndUpdate both rely on those indexes.
