import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type HydratedDocument } from "mongoose"

import type { WalletTxKind } from "../../shared/index.js"

/** One balance per player, keyed by Clerk `userId`. Created on first touch. */
@Schema({ timestamps: true })
export class Wallet {
  // Explicit `type: X` on every field — see the note in payment.schema.ts.
  @Prop({ type: String, required: true, unique: true }) userId: string
  /** VND. Never negative: debits are guarded on `balance >= amount`. */
  @Prop({ type: Number, required: true, default: 0 }) balance: number
}

export type WalletDocument = HydratedDocument<Wallet>
export const WalletSchema = SchemaFactory.createForClass(Wallet)

/**
 * Append-only ledger. `txId` is the idempotency key (`topup-<invoice>`,
 * `pay-<bookingId>`, `refund-<bookingId>`): a replayed IPN / retried refund
 * hits the unique index and moves no money twice.
 */
@Schema({ timestamps: true })
export class WalletTx {
  @Prop({ type: String, required: true, unique: true }) txId: string
  @Prop({ type: String, required: true, index: true }) userId: string
  @Prop({ type: String, required: true }) kind: WalletTxKind
  /** Signed VND. */
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: Number, required: true }) balanceAfter: number
  @Prop({ type: String, required: true }) note: string
  @Prop({ type: String }) bookingId?: string
  /** ISO datetime (+07:00). */
  @Prop({ type: String, required: true }) at: string
}

export type WalletTxDocument = HydratedDocument<WalletTx>
export const WalletTxSchema = SchemaFactory.createForClass(WalletTx)
WalletTxSchema.index({ userId: 1, createdAt: -1 })
