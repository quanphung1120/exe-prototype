import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type HydratedDocument } from "mongoose"

import type { WithdrawalStatus } from "../../shared/index.js"

/**
 * A player's request to take money out of their wallet back to a bank account.
 * The amount leaves the wallet when the request is made (so it can't be spent
 * twice) and an admin then transfers it by hand: `completed` once sent,
 * `rejected` (the money returns to the wallet) if it can't be.
 */
@Schema({ timestamps: true })
export class Withdrawal {
  // Explicit `type: X` on every field — see the note in payment.schema.ts.
  @Prop({ type: String, required: true, unique: true }) withdrawalId: string
  @Prop({ type: String, required: true, index: true }) userId: string
  /** VND. */
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: String, required: true }) bankName: string
  @Prop({ type: String, required: true }) accountNumber: string
  @Prop({ type: String, required: true }) accountHolder: string
  @Prop({ type: String, required: true }) status: WithdrawalStatus
  /** The bank transfer reference the admin recorded once it was sent. */
  @Prop({ type: String }) ref?: string
  /** Why it was rejected. */
  @Prop({ type: String }) adminNote?: string
  /** ISO datetime (+07:00). */
  @Prop({ type: String, required: true }) requestedAt: string
  @Prop({ type: String }) resolvedAt?: string
}

export type WithdrawalDocument = HydratedDocument<Withdrawal>
export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal)
WithdrawalSchema.index({ status: 1, createdAt: 1 })
