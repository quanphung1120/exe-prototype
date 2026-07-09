import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { Player as PlayerType, SportKey } from "../../shared/index.js"

// A match-suggestion Player — one document per `Player` (shared types). Like
// courts, these are *shared discovery data*: seeded once from the hardcoded
// `MATCH_SUGGESTIONS` (see player.service) and every user sees the same pool.
@Schema({ timestamps: true })
export class Player {
  @Prop({ required: true, unique: true, index: true }) playerId: string
  @Prop({ required: true }) name: string
  @Prop({ required: true }) initials: string
  // `type: String` is explicit because the field types are string unions —
  // @nestjs/mongoose can't infer a Mongoose type from union decorator metadata.
  @Prop({
    type: String,
    required: true,
    enum: ["beginner", "intermediate", "advanced"],
  })
  level: PlayerType["level"]
  @Prop({ type: String, required: true, enum: ["pickleball", "badminton"] })
  sport: SportKey
  // Distance from the current user, km.
  @Prop({ required: true }) distanceKm: number
  // AI compatibility score, 0–100.
  @Prop({ required: true }) matchPct: number
  // Reliability/reputation score, 0–100.
  @Prop({ required: true }) trust: number
  @Prop({ default: false }) online: boolean
  @Prop({ default: "" }) blurb: string
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
