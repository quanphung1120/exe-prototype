import mongoose from "mongoose"

import type { PlaySession } from "@repo/shared"

const { Schema } = mongoose

// A player's persisted PlaySession. The web dashboard drives all matchmaking /
// booking logic client-side over one `sessions` array; this collection is the
// durable mirror of the sessions a signed-in user *creates or changes* (a
// booking they confirm, a room they open, a cancellation). Shared demo sessions
// stay hardcoded in the seed — these are layered on top, per user, so a refresh
// or server restart reloads the user's own activity.
//
// The full session is stored under `data` (Mixed) keyed by the client-generated
// `sessionId`; the seed merge overrides any demo session sharing that id, so a
// user can also persist a change to a seeded room.
const sessionSchema = new Schema(
  {
    // Clerk user id (getAuth(c).userId) — every session is scoped to its owner.
    userId: { type: String, required: true, index: true },
    // The client PlaySession.id this document mirrors.
    sessionId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false }
)

// One row per (user, session): upserts target this pair, so a user can't hold
// two copies of the same session.
sessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true })

export type SessionDoc = {
  userId: string
  sessionId: string
  data: PlaySession
}

export const SessionModel =
  (mongoose.models.PlaySession as mongoose.Model<SessionDoc>) ??
  mongoose.model<SessionDoc>("PlaySession", sessionSchema)
