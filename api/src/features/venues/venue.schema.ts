import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type {
  Venue as VenueInfo,
  VenueApprovalStatus,
} from "../../shared/index.js"

import type { VenueOps } from "../../data/venue.js"

// A venue document stores one operator venue as a whole VenueRecord
// ({ info, ops }). `info` (profile) and `ops` (courts, reservations, analytics,
// insights, …) are kept as flexible Mixed sub-documents — `ops` nests localized
// strings and chart series that are still demo data. Writers mutate the loaded
// document and `markModified(...)` the touched branch before `save()`.
// `optimisticConcurrency` versions every save so a concurrent writer's stale save
// throws `VersionError` instead of clobbering the whole Mixed branch (see
// VenuesService.withVersionRetry). `minimize: false` keeps empty objects/arrays.
@Schema({ timestamps: true, minimize: false, optimisticConcurrency: true })
export class Venue {
  @Prop({ type: String, required: true, unique: true, index: true })
  venueId: string
  // Clerk account that owns this venue's brand, denormalized from
  // Brand.ownerId so booking/notification auth needs no brand join. No longer
  // unique — an account's brand may own many venue branches; the one-per-account
  // constraint now lives on Brand.ownerId. Indexed (non-unique) for owner reads.
  @Prop({ type: String, index: true }) ownerId?: string
  // The brand (chi nhánh's parent) this venue belongs to; absent on ownerless
  // demo seeds. Indexed for brand-scoped branch listing.
  @Prop({ type: String, index: true }) brandId?: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) info: VenueInfo
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) ops: VenueOps
  // Monotonic high-water court-id counter. Persisted so ids are never reused
  // after a deletion; seeded lazily from the current max. (Reservation ids
  // used to have an equivalent counter here — bookings are now their own
  // `bookings` collection keyed by a Mongo ObjectId, see BookingsService.)
  @Prop({ type: Number }) courtSeq?: number
  // Monotonic high-water court-block-id counter (Phase 6, decision #12) — same
  // shape/reason as `courtSeq` above, minting `CourtBlock.id`. Older persisted
  // docs predate both this counter and `ops.blocks`; every read of the latter
  // defaults with `?? []` (see `VenuesService`).
  @Prop({ type: Number }) blockSeq?: number
  // Manual admin approval gate. Missing on venues seeded before this field
  // existed / hardcoded demo venues — every read treats an absent value as
  // "approved" (see `withApproval`, venues.service.ts) rather than backfilling
  // every existing document. Indexed for the admin approvals-queue query.
  @Prop({ type: String, index: true }) approval?: VenueApprovalStatus
  @Prop({ type: String }) approvalReason?: string
  @Prop({ type: String }) approvedAt?: string
}

export type VenueDocument = HydratedDocument<Venue>
export const VenueSchema = SchemaFactory.createForClass(Venue)

/**
 * A venue doc's resolved approval status, treating an absent value (venues
 * seeded before this field existed, and the hardcoded `INITIAL_VENUES` demo
 * seed) as `"approved"` rather than backfilling every existing document.
 * Shared by `VenuesService` (approval-queue reads/writes) and
 * `BookingsService` (the booking-creation gate) — lives here, not in either
 * service, since those two already depend on each other and a helper on
 * either side would be a circular import.
 */
export function effectiveApproval(doc: {
  approval?: VenueApprovalStatus
}): VenueApprovalStatus {
  return doc.approval ?? "approved"
}
