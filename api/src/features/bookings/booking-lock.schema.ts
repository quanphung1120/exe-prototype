import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

/**
 * A short-lived mutex document, acquired by inserting (unique index on `key`
 * does the exclusion) and released by deleting. Used only as a fallback when
 * the MongoDB deployment doesn't support multi-document transactions (see
 * `isTransactionsUnsupported` / `bookings.service.ts`'s overlap guard) — on a
 * transaction-capable deployment (Atlas, including the free M0 tier) this
 * collection stays empty.
 */
@Schema({ timestamps: true })
export class BookingLock {
  // Explicit `type: String` (not inferred from the TS annotation) since
  // esbuild-based runners like tsx don't emit the design:type metadata @Prop()
  // needs — see test/sessions-service.test.ts.
  @Prop({ type: String, required: true, unique: true }) key: string
}

export type BookingLockDocument = HydratedDocument<BookingLock>
export const BookingLockSchema = SchemaFactory.createForClass(BookingLock)

// Self-heal an orphaned lock: if a holder is killed between acquiring the lock
// (insert) and releasing it (the `finally` delete in `withCourtLock`), MongoDB's
// TTL monitor reaps the doc so a court+day can't deadlock forever. The critical
// section is sub-second, so a 60s expiry never reaps a live lock.
BookingLockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 })
