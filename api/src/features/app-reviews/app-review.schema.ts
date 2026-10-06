import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { AppReviewRole } from "../../shared/index.js"

// A user's review of the app itself — one per Clerk user (re-submitting
// edits it), surfaced on the landing page unless an admin hides it.
// Explicit `type:` on every @Prop for the same reason as session.schema.ts
// (tsx/esbuild don't emit the design:type metadata @Prop() infers from).
@Schema({ timestamps: true })
export class AppReview {
  @Prop({ required: true, unique: true, type: String }) userId: string
  /** Public display name captured at submit time (see getPublicProfile). */
  @Prop({ required: true, type: String }) authorName: string
  @Prop({ required: true, type: String }) initials: string
  @Prop({ type: String }) image?: string
  @Prop({ required: true, type: String, enum: ["player", "venue"] })
  role: AppReviewRole
  @Prop({ required: true, type: Number, min: 1, max: 5 }) rating: number
  @Prop({ type: String, default: "" }) comment: string
  /** Moderation: hidden reviews are kept but never shown publicly. */
  @Prop({ type: Boolean, default: false }) hidden: boolean

  createdAt: Date
  updatedAt: Date
}

export type AppReviewDocument = HydratedDocument<AppReview>
export const AppReviewSchema = SchemaFactory.createForClass(AppReview)

// Landing query: visible, high-rated reviews, newest first.
AppReviewSchema.index({ hidden: 1, rating: -1, updatedAt: -1 })
