import mongoose from "mongoose"

import type { Player } from "@repo/shared"

const { Schema } = mongoose

// A match-suggestion Player — one document per `Player` (packages/shared/src/
// types.ts). Like courts, these are *shared discovery data*: the collection is
// seeded once from the hardcoded `MATCH_SUGGESTIONS` (see player-service.ts) and
// every user sees the same candidate pool. Fields are schematized because Player
// is a clean flat entity.
const playerSchema = new Schema(
  {
    // Mirrors `Player.id` — the stable app-level id the UI/routes key on.
    playerId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    initials: { type: String, required: true },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },
    sport: {
      type: String,
      enum: ["pickleball", "badminton"],
      required: true,
    },
    // Distance from the current user, km.
    distanceKm: { type: Number, required: true },
    // AI compatibility score, 0–100.
    matchPct: { type: Number, required: true },
    // Reliability/reputation score, 0–100.
    trust: { type: Number, required: true },
    online: { type: Boolean, default: false },
    blurb: { type: String, default: "" },
  },
  { timestamps: true }
)

// The stored shape: the full Player plus the mongo-managed `playerId` key.
export type PlayerDoc = Omit<Player, "id"> & { playerId: string }

// Guard against model re-compilation on `tsx watch` hot-reloads (Mongoose
// throws `OverwriteModelError` if a model name is registered twice).
export const PlayerModel =
  (mongoose.models.Player as mongoose.Model<PlayerDoc>) ??
  mongoose.model<PlayerDoc>("Player", playerSchema)
