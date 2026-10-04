import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

// A peer review one player leaves another after a match they both played.
// One per (rater, ratee, session) — enforced by the unique index below.
// Explicit `type:` on every @Prop for the same reason as session.schema.ts
// (tsx/esbuild don't emit the design:type metadata @Prop() infers from).
@Schema({ timestamps: true })
export class Rating {
  /** Clerk id of the player leaving the review. */
  @Prop({ required: true, type: String }) raterId: string
  /** Display name of the rater at the time of rating (shown on the profile). */
  @Prop({ required: true, type: String }) raterName: string
  /** Clerk id of the player being reviewed. */
  @Prop({ required: true, index: true, type: String }) rateeId: string
  /** The PlaySession (match) both played in. */
  @Prop({ required: true, type: String }) sessionId: string
  @Prop({ required: true, type: Number, min: 1, max: 5 }) stars: number
  @Prop({ type: String }) comment?: string

  createdAt: Date
}

export type RatingDocument = HydratedDocument<Rating>
export const RatingSchema = SchemaFactory.createForClass(Rating)

RatingSchema.index({ raterId: 1, rateeId: 1, sessionId: 1 }, { unique: true })
// Profile summary: a ratee's newest reviews first.
RatingSchema.index({ rateeId: 1, createdAt: -1 })
