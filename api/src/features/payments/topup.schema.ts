import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { TopUpStatus } from "../../shared/index.js"

/**
 * One SePay checkout that funds a player's wallet. `invoiceNumber`
 * (`TU-<uuid>`) is SePay's idempotency key and this collection's; the `TU-`
 * prefix is how the IPN tells a top-up from a booking payment.
 */
@Schema({ timestamps: true })
export class TopUp {
  @Prop({ type: String, required: true, unique: true }) invoiceNumber: string
  @Prop({ type: String, required: true, index: true }) userId: string
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: String, required: true }) status: TopUpStatus
  @Prop({ type: String }) paidAt?: string
  @Prop({ type: MongooseSchema.Types.Mixed }) ipnPayload?: unknown
}

export type TopUpDocument = HydratedDocument<TopUp>
export const TopUpSchema = SchemaFactory.createForClass(TopUp)

/** Invoice prefix that marks a wallet top-up (vs. a bookingId). */
export const TOPUP_INVOICE_PREFIX = "TU-"
