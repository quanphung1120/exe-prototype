import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { Court as CourtType, SportKey } from "../../shared/index.js"

// A bookable court in the finder catalog — one document per `Court`
// (shared types). Courts are *shared discovery data*: the collection is seeded
// once from the hardcoded `COURTS` (see courts.service) and every user browses
// the same rows. `courtId` mirrors the stable app-level `Court.id` the UI keys
// on; the mongo `_id` stays internal.
@Schema({ timestamps: true })
export class Court {
  @Prop({ required: true, unique: true, index: true }) courtId: string
  @Prop({ required: true }) name: string
  @Prop({ required: true }) district: string
  @Prop({ required: true }) city: string
  @Prop({ type: [String], enum: ["badminton"] }) sports: SportKey[]
  @Prop({ required: true }) surface: string
  @Prop({ required: true }) pricePerHour: number
  @Prop({ required: true }) distanceKm: number
  @Prop({ required: true }) rating: number
  @Prop({ required: true }) openSlots: number
  @Prop({ required: true }) nextSlot: string
  // Share of today's slots still free, 0–100.
  @Prop({ required: true }) freePct: number
  // Geographic position for the Find Courts map (WGS84).
  @Prop({ required: true }) lat: number
  @Prop({ required: true }) lng: number
}

export type CourtDocument = HydratedDocument<Court>
export const CourtSchema = SchemaFactory.createForClass(Court)

/** Map a stored document back to the shared `Court` shape (courtId → id). */
export function toCourt(doc: Court): CourtType {
  return {
    id: doc.courtId,
    name: doc.name,
    district: doc.district,
    city: doc.city,
    sports: doc.sports,
    surface: doc.surface,
    pricePerHour: doc.pricePerHour,
    distanceKm: doc.distanceKm,
    rating: doc.rating,
    openSlots: doc.openSlots,
    nextSlot: doc.nextSlot,
    freePct: doc.freePct,
    lat: doc.lat,
    lng: doc.lng,
  }
}
