import mongoose from "mongoose"

import type {
  ActivityItem,
  Booking,
  Chat,
  MatchRoom,
  Message,
  NotificationItem,
  Stats,
  Streak,
  User,
} from "@repo/shared"

const { Schema } = mongoose

// A signed-in player's personal dashboard state — one document per Clerk user.
// Unlike courts/players (shared discovery data), everything here is *personal*:
// the doc is seeded per-user on first access from the hardcoded fixtures (see
// profile-service.ts) as their "pre-data", then their own mutations persist on
// top. The player-facing sub-fields are stored as Mixed sub-documents: they are
// demo blobs (localized/derived UI content) with no per-field query needs, so
// schematizing them buys nothing. `minimize: false` keeps intentionally-empty
// arrays (e.g. no notifications) instead of stripping them.
const profileSchema = new Schema(
  {
    // Clerk user id (getAuth(c).userId) — one profile per owner.
    userId: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.Mixed, required: true },
    streak: { type: Schema.Types.Mixed, required: true },
    stats: { type: Schema.Types.Mixed, required: true },
    rooms: { type: Schema.Types.Mixed, required: true },
    bookings: { type: Schema.Types.Mixed, required: true },
    chats: { type: Schema.Types.Mixed, required: true },
    thread: { type: Schema.Types.Mixed, required: true },
    activity: { type: Schema.Types.Mixed, required: true },
    notifications: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false }
)

// The personal-data payload the profile carries (everything but `userId` and the
// mongo-managed fields).
export interface ProfileData {
  user: User
  streak: Streak
  stats: Stats
  rooms: MatchRoom[]
  bookings: Booking[]
  chats: Chat[]
  thread: Message[]
  activity: ActivityItem[]
  notifications: NotificationItem[]
}

export type ProfileDoc = ProfileData & { userId: string }

// Guard against model re-compilation on `tsx watch` hot-reloads (Mongoose throws
// OverwriteModelError if a model name is registered twice).
export const ProfileModel =
  (mongoose.models.Profile as mongoose.Model<ProfileDoc>) ??
  mongoose.model<ProfileDoc>("Profile", profileSchema)
