import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { PlayerAssessment as PlayerAssessmentData } from "../../shared/index.js"

// A player's completed skills self-assessment, persisted per Clerk user. A user
// has exactly one assessment, so this is one document per `userId`, upserted in
// place. The full payload is stored under `data` (Mixed); the shape is owned by
// the web feature (shared types PlayerAssessment).
@Schema({ timestamps: true, minimize: false })
export class PlayerAssessment {
  // Explicit `type: String` (not inferred from the TS annotation) since
  // esbuild-based runners like tsx don't emit the design:type metadata @Prop()
  // needs — see test/sessions-service.test.ts (this schema wasn't reachable
  // from any test's import graph until SeedService started depending on
  // AssessmentService, which is what surfaced this).
  @Prop({ type: String, required: true, unique: true, index: true })
  userId: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: PlayerAssessmentData
}

export type PlayerAssessmentDocument = HydratedDocument<PlayerAssessment>
export const PlayerAssessmentSchema =
  SchemaFactory.createForClass(PlayerAssessment)
