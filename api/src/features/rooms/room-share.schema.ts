import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type HydratedDocument } from "mongoose"

import type { RoomShareStatus } from "../../shared/index.js"

/**
 * One member's payment toward a booked room's court. The host paid the venue
 * up front; each member pays their seat's share (court price ÷ room capacity)
 * into the host's wallet. `shareId` keys the wallet ledger rows, so a retried
 * call can never move the money twice.
 */
@Schema({ timestamps: true })
export class RoomShare {
  // Explicit `type: X` on every field — see the note in payment.schema.ts.
  @Prop({ type: String, required: true, unique: true }) shareId: string
  /** The room's client-generated session id. */
  @Prop({ type: String, required: true, index: true }) roomId: string
  @Prop({ type: String, required: true }) bookingId: string
  @Prop({ type: String, required: true }) hostUserId: string
  @Prop({ type: String, required: true, index: true }) memberUserId: string
  /** VND. */
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: String, required: true }) status: RoomShareStatus
  /**
   * A paid member can only leave with the host's say-so (the host already paid
   * the venue): `pending` until answered, `rejected` if refused — which is
   * what lets the member complain — or `approved` once refunded.
   */
  @Prop({ type: String }) leaveStatus?: "pending" | "rejected" | "approved"
  /**
   * VND paid back to the member out of the booking's refund when the host's
   * booking was cancelled (a share of the refund %, not taken from the host's
   * wallet). Set only for shares the host had already been paid.
   */
  @Prop({ type: Number }) bookingRefund?: number
  /** ISO datetime (+07:00) of the leave request. */
  @Prop({ type: String }) leaveRequestedAt?: string
}

export type RoomShareDocument = HydratedDocument<RoomShare>
export const RoomShareSchema = SchemaFactory.createForClass(RoomShare)
RoomShareSchema.index({ roomId: 1, memberUserId: 1 })
