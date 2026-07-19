import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type {
  BookingCustomer,
  BookingRecordStatus,
  BookingRefund,
  BookingSource,
  BookingStatusEvent,
  PaymentStatus,
  SportKey,
} from "../../shared/index.js"

/**
 * The canonical booking record (VienTD-Review decision #1: booking ≡
 * reservation, one entity) — a court-time hold that started as a player's app
 * booking or an operator's walk-in. A venue's operator-facing `Reservation[]`
 * is a read-time projection of these (`booking.helpers.ts#reservationFromBooking`);
 * a player's `PlaySession` derives its status/hold/refund from whichever
 * record its `reservationId` points at. `optimisticConcurrency` versions every
 * save so the overlap-check-then-write in `bookings.service.ts` can retry a
 * stale write instead of silently losing a concurrent status change.
 */
@Schema({ timestamps: true, minimize: false, optimisticConcurrency: true })
export class Booking {
  // Explicit `type: X` on every field below (rather than relying on
  // reflect-metadata to infer it from the TS annotation) since esbuild-based
  // runners like tsx don't emit the design:type metadata @Prop() needs — see
  // test/sessions-service.test.ts.
  @Prop({ type: String, required: true, unique: true }) bookingId: string
  @Prop({ type: String, required: true }) venueId: string
  @Prop({ type: String, required: true }) courtId: string
  @Prop({ type: String, required: true }) courtName: string
  @Prop({ type: String, required: true }) sport: SportKey
  @Prop({ type: String, required: true }) source: BookingSource
  @Prop({ type: String }) userId?: string
  @Prop({ type: String }) sessionId?: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  customer: BookingCustomer
  @Prop({ type: String, required: true }) startAt: string
  @Prop({ type: String, required: true }) endAt: string
  @Prop({ type: String, required: true }) dateKey: string
  @Prop({ type: String, required: true }) start: string
  @Prop({ type: Number, required: true }) durationMin: number
  @Prop({ type: Number, required: true }) price: number
  @Prop({ type: String, required: true }) status: BookingRecordStatus
  @Prop({ type: String, required: true }) paymentStatus: PaymentStatus
  @Prop({ type: String }) holdExpiresAt?: string
  @Prop({ type: String }) confirmDeadlineAt?: string
  @Prop({ type: String }) checkedInAt?: string
  @Prop({ type: String }) declineReason?: string
  @Prop({ type: String }) cancelReason?: string
  @Prop({ type: MongooseSchema.Types.Mixed }) refund?: BookingRefund
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  statusHistory: BookingStatusEvent[]
}

export type BookingDocument = HydratedDocument<Booking>
export const BookingSchema = SchemaFactory.createForClass(Booking)

// The overlap check filters exactly this shape (one court's bookings on one
// day); the compound index makes that a covered scan instead of a full
// collection scan as bookings grow.
BookingSchema.index({ venueId: 1, courtId: 1, dateKey: 1 })
// "My bookings", ordered by start time.
BookingSchema.index({ userId: 1, startAt: 1 })
// Player-session → booking lookup (status derivation on read).
BookingSchema.index({ sessionId: 1 })
// Scheduler queries (a future phase): unpaid holds past their deadline, and
// pending bookings past the 30-minute approval SLA.
BookingSchema.index({ status: 1, holdExpiresAt: 1 })
BookingSchema.index({ status: 1, confirmDeadlineAt: 1 })
