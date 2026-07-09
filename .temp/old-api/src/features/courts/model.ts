import mongoose from "mongoose"

import type { Court } from "@repo/shared"

const { Schema } = mongoose

// A bookable court in the finder catalog — one document per `Court`
// (packages/shared/src/types.ts). Unlike the per-user profile fixtures, courts
// are *shared discovery data*: the collection is seeded once from the hardcoded
// `COURTS` (see court-service.ts) and every user browses the same rows. Fields
// are schematized (not stored as an opaque blob) because Court is a clean flat
// entity, so the model is the real schema rather than a Mixed passthrough.
const courtSchema = new Schema(
  {
    // Mirrors `Court.id` — the stable app-level id the UI/routes key on.
    // Indexed + unique so lookups can't duplicate a court.
    courtId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    district: { type: String, required: true },
    city: { type: String, required: true },
    sports: [{ type: String, enum: ["pickleball", "badminton"] }],
    surface: { type: String, required: true },
    pricePerHour: { type: Number, required: true },
    distanceKm: { type: Number, required: true },
    rating: { type: Number, required: true },
    openSlots: { type: Number, required: true },
    nextSlot: { type: String, required: true },
    // Share of today's slots still free, 0–100.
    freePct: { type: Number, required: true },
    // Geographic position for the Find Courts map (WGS84).
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { timestamps: true }
)

// The stored shape: the full Court plus the mongo-managed `courtId` key.
export type CourtDoc = Omit<Court, "id"> & { courtId: string }

// Guard against model re-compilation on `tsx watch` hot-reloads (Mongoose throws
// OverwriteModelError if a model name is registered twice).
export const CourtModel =
  (mongoose.models.Court as mongoose.Model<CourtDoc>) ??
  mongoose.model<CourtDoc>("Court", courtSchema)
