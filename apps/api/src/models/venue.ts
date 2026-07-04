import mongoose from "mongoose"

import type { VenueRecord } from "../data/venue.js"

const { Schema } = mongoose

// A venue document stores one operator venue as a whole `VenueRecord`
// ({ info, ops }) — the same shape the in-memory store used to hold. `info`
// (profile) and `ops` (courts, reservations, analytics, insights, …) are kept
// as flexible sub-documents: `ops` in particular nests localized strings and
// several chart series that are still demo data, so schematizing every field
// buys little. Writers mutate the loaded document and `markModified(...)` the
// touched branch before `save()`. `minimize: false` keeps intentionally-empty
// objects/arrays (e.g. a fresh venue's empty `reservations`) instead of
// stripping them.
const venueSchema = new Schema(
  {
    // Mirrors `info.id` — the stable app-level id the UI/routes key on. Indexed
    // + unique so lookups and upserts are cheap and can't duplicate a venue.
    venueId: { type: String, required: true, unique: true, index: true },
    info: { type: Schema.Types.Mixed, required: true },
    ops: { type: Schema.Types.Mixed, required: true },
    // Monotonic high-water id counters (courts/reservations). Persisted so ids
    // are never reused after a deletion; seeded lazily from the current max.
    courtSeq: { type: Number },
    reservationSeq: { type: Number },
  },
  // `optimisticConcurrency` versions every save (`__v` in the query filter) so a
  // concurrent writer's save throws `VersionError` instead of silently
  // clobbering the whole Mixed `ops`/`info` branch (see venue-service's
  // withVersionRetry).
  { timestamps: true, minimize: false, optimisticConcurrency: true }
)

// Full VenueRecord plus the mongo-managed fields we read back (order is derived
// from insertion via createdAt/_id in the store) and the persisted id counters.
export type VenueDoc = VenueRecord & {
  venueId: string
  courtSeq?: number
  reservationSeq?: number
}

// Guard against model re-compilation on `tsx watch` hot-reloads (Mongoose throws
// OverwriteModelError if a model name is registered twice).
export const VenueModel =
  (mongoose.models.Venue as mongoose.Model<VenueDoc>) ??
  mongoose.model<VenueDoc>("Venue", venueSchema)
