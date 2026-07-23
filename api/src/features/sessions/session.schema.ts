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
  // Clerk user id — every session is scoped to its owner. Explicit `type:
  // String` (rather than relying on reflect-metadata to infer it from the TS
  // annotation) since esbuild-based runners like tsx don't emit the design:type
  // metadata @Prop() needs — see test/sessions-service.test.ts.
  @Prop({ required: true, index: true, type: String }) userId: string
  // The client PlaySession.id this document mirrors.
  @Prop({ required: true, type: String }) sessionId: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: PlaySessionData
}

export type PlaySessionDocument = HydratedDocument<PlaySession>
export const PlaySessionSchema = SchemaFactory.createForClass(PlaySession)

// One row per (user, session): upserts target this pair, so a user can't hold
// two copies of the same session.
PlaySessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true })

// Backs `GET /api/rooms` (Phase 9 G2) — the cross-user scan for listed,
// browsable rooms filters on both fields together (`listed: true` and an
// active `status`), so a compound index serves it directly instead of a full
// collection scan.
PlaySessionSchema.index({ "data.listed": 1, "data.status": 1 })
