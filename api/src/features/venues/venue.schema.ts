import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { Venue as VenueInfo } from "../../shared/index.js"

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
  // Clerk account that owns this venue. Sparse so the ownerless demo seeds don't
  // collide; unique so each account holds at most one venue (see index below).
  @Prop({ type: String }) ownerId?: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) info: VenueInfo
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) ops: VenueOps
  // Monotonic high-water id counters (courts/reservations). Persisted so ids are
  // never reused after a deletion; seeded lazily from the current max.
  @Prop({ type: Number }) courtSeq?: number
  @Prop({ type: Number }) reservationSeq?: number
}

export type VenueDocument = HydratedDocument<Venue>
export const VenueSchema = SchemaFactory.createForClass(Venue)
// One venue per account: unique on ownerId but sparse, so the many ownerless
// demo venues (ownerId absent) are exempt and only real owners are constrained.
VenueSchema.index({ ownerId: 1 }, { unique: true, sparse: true })
