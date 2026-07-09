import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { PlaySession as PlaySessionData } from "../../shared/index.js"

// A player's persisted PlaySession. The web dashboard drives all matchmaking /
// booking logic client-side over one `sessions` array; this collection is the
// durable mirror of the sessions a signed-in user *creates or changes*. The full
// session is stored under `data` (Mixed) keyed by the client-generated
// `sessionId`; the seed merge overrides any demo session sharing that id.
@Schema({ timestamps: true, minimize: false })
export class PlaySession {
  // Clerk user id — every session is scoped to its owner.
  @Prop({ required: true, index: true }) userId: string
  // The client PlaySession.id this document mirrors.
  @Prop({ required: true }) sessionId: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) data: PlaySessionData
}

export type PlaySessionDocument = HydratedDocument<PlaySession>
export const PlaySessionSchema = SchemaFactory.createForClass(PlaySession)

// One row per (user, session): upserts target this pair, so a user can't hold
// two copies of the same session.
PlaySessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true })
