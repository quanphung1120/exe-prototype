import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type {
  AccountType,
  ActivityItem,
  Booking,
  MatchRoom,
  NotificationItem,
  Stats,
  Streak,
  User,
} from "../../shared/index.js"

// A signed-in player's personal dashboard state — one document per Clerk user.
// Unlike courts/players (shared discovery data), everything here is *personal*:
// the doc is seeded per-user on first access from the hardcoded fixtures (see
// profile.service) as their "pre-data", then their own mutations persist on top.
// The sub-fields are stored as Mixed sub-documents — demo blobs (localized/derived
// UI content) with no per-field query needs. `minimize: false` keeps
// intentionally-empty arrays (e.g. no notifications).
@Schema({ timestamps: true, minimize: false })
export class Profile {
  // Explicit `type: String` (rather than relying on reflect-metadata to infer
  // it from the TS annotation) since esbuild-based runners like tsx don't
  // emit the design:type metadata @Prop() needs — see
  // test/bookings-sweeper.test.ts / test/venues-service.test.ts, which are
  // the first tests to import ProfileService as a real DI token (Phase 5).
  @Prop({ required: true, unique: true, index: true, type: String })
  userId: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) user: User
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) streak: Streak
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) stats: Stats
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) rooms: MatchRoom[]
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) bookings: Booking[]
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  activity: ActivityItem[]
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  notifications: NotificationItem[]
  /** Self-declared account type, chosen once on the onboarding page. */
  @Prop({ type: String, default: null }) accountType: AccountType | null
}

// The personal-data payload the profile carries (everything but `userId` and the
// mongo-managed fields).
export interface ProfileData {
  user: User
  streak: Streak
  stats: Stats
  rooms: MatchRoom[]
  bookings: Booking[]
  activity: ActivityItem[]
  notifications: NotificationItem[]
  accountType: AccountType | null
}

export type ProfileDocument = HydratedDocument<Profile>
export const ProfileSchema = SchemaFactory.createForClass(Profile)

/** Slice the personal-data payload out of a stored profile document. */
export function toProfileData(doc: Profile): ProfileData {
  return {
    user: doc.user,
    streak: doc.streak,
    stats: doc.stats,
    rooms: doc.rooms,
    bookings: doc.bookings,
    activity: doc.activity,
    notifications: doc.notifications,
    accountType: doc.accountType ?? null,
  }
}
