import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type HydratedDocument } from "mongoose"

import type { ComplaintKind, ComplaintStatus } from "../../shared/index.js"

/**
 * A member's complaint to the platform when the host refuses their request to
 * leave a booked room (or never answers it): they paid their share and can't
 * get out. An admin decides — refund it or dismiss.
 */
@Schema({ timestamps: true })
export class RoomComplaint {
  // Explicit `type: X` on every field — see the note in payment.schema.ts.
  @Prop({ type: String, required: true, unique: true }) complaintId: string
  /** What the complaint is about; older rows are all `room_leave`. */
  @Prop({ type: String, default: "room_leave" }) kind: ComplaintKind
  /** Empty for a `cancel_decline` complaint (no room involved). */
  @Prop({ type: String, index: true }) roomId: string
  @Prop({ type: String, required: true }) roomTitle: string
  /** The `RoomShare` the complaint is about (`room_leave` only). */
  @Prop({ type: String }) shareId: string
  /** `cancel_decline` only: the venue's wrongful-decline count after this complaint was upheld. */
  @Prop({ type: Number }) venueViolations?: number
  @Prop({ type: String, required: true }) bookingId: string
  @Prop({ type: String, required: true }) memberUserId: string
  @Prop({ type: String, required: true }) memberName: string
  @Prop({ type: String, required: true }) hostUserId: string
  @Prop({ type: String, required: true }) hostName: string
  @Prop({ type: Number, required: true }) amount: number
  @Prop({ type: String, required: true }) reason: string
  @Prop({ type: String, required: true }) status: ComplaintStatus
  @Prop({ type: String }) adminNote?: string
  @Prop({ type: Boolean }) platformFunded?: boolean
  /** ISO datetime (+07:00). */
  @Prop({ type: String, required: true }) filedAt: string
  @Prop({ type: String }) resolvedAt?: string
}

export type RoomComplaintDocument = HydratedDocument<RoomComplaint>
export const RoomComplaintSchema = SchemaFactory.createForClass(RoomComplaint)
RoomComplaintSchema.index({ status: 1, createdAt: -1 })
