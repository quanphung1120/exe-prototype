import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { Player as PlayerType, SportKey } from "../../shared/index.js"

// A match-suggestion Player — one document per `Player` (shared types). Like
// courts, these are *shared discovery data*: seeded once from the hardcoded
// `MATCH_SUGGESTIONS` (see player.service) and every user sees the same pool.
@Schema({ timestamps: true })
export class Player {
  // Explicit `type: X` on every field below (rather than relying on
  // reflect-metadata to infer it from the TS annotation) since esbuild-based
  // runners like tsx don't emit the design:type metadata @Prop() needs — see
  // test/sessions-service.test.ts (this schema wasn't reachable from any
  // test's import graph until SeedService started depending on PlayerService,
  // which is what surfaced this).
  @Prop({ type: String, required: true, unique: true, index: true })
  playerId: string
  @Prop({ type: String, required: true }) name: string
  @Prop({ type: String, required: true }) initials: string
  @Prop({
    type: String,
    required: true,
    enum: ["beginner", "intermediate", "advanced"],
  })
  level: PlayerType["level"]
  @Prop({ type: String, required: true, enum: ["badminton"] })
  sport: SportKey
  // Distance from the current user, km.
  @Prop({ type: Number, required: true }) distanceKm: number
  // AI compatibility score, 0–100.
  @Prop({ type: Number, required: true }) matchPct: number
  // Reliability/reputation score, 0–100.
  @Prop({ type: Number, required: true }) trust: number
  @Prop({ type: Boolean, default: false }) online: boolean
  @Prop({ type: String, default: "" }) blurb: string
}

export type PlayerDocument = HydratedDocument<Player>
export const PlayerSchema = SchemaFactory.createForClass(Player)

/** Map a stored document back to the shared `Player` shape (playerId → id). */
export function toPlayer(doc: Player): PlayerType {
  return {
    id: doc.playerId,
    name: doc.name,
    initials: doc.initials,
    level: doc.level,
    sport: doc.sport,
    distanceKm: doc.distanceKm,
    matchPct: doc.matchPct,
    trust: doc.trust,
    online: doc.online,
    blurb: doc.blurb,
  }
}
