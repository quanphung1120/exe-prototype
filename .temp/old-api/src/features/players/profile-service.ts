// MongoDB-backed profile service. A player's personal dashboard state (their
// user card, streak, stats, rooms, bookings, chats, thread, activity,
// notifications) is *per-user*: on a signed-in user's first access the document
// is seeded from the hardcoded fixtures as their "pre-data", then their own
// mutations persist on top. Seeding uses an atomic `$setOnInsert` upsert so two
// concurrent first-requests can't double-insert or race on the content.

import type { ProfileData } from "./profile-model.js"

import {
  ACTIVITY,
  BOOKINGS,
  CHATS,
  NOTIFICATIONS,
  ROOMS,
  STATS,
  STREAK,
  THREAD,
  USER,
} from "../../data/player.js"
import { connectDb } from "../../lib/db.js"
import { ProfileModel, type ProfileDoc } from "./profile-model.js"

/** The pre-data every new user starts from (the hardcoded demo fixtures). */
function seedData(): ProfileData {
  return {
    user: USER,
    streak: STREAK,
    stats: STATS,
    rooms: ROOMS,
    bookings: BOOKINGS,
    chats: CHATS,
    thread: THREAD,
    activity: ACTIVITY,
    notifications: NOTIFICATIONS,
  }
}

function toData(doc: ProfileDoc): ProfileData {
  return {
    user: doc.user,
    streak: doc.streak,
    stats: doc.stats,
    rooms: doc.rooms,
    bookings: doc.bookings,
    chats: doc.chats,
    thread: doc.thread,
    activity: doc.activity,
    notifications: doc.notifications,
  }
}

/**
 * The user's personal dashboard data, seeding their pre-data on first access.
 * The `$setOnInsert` upsert only writes the seed when the document doesn't yet
 * exist, so a returning user keeps their persisted state untouched.
 */
export async function getProfile(userId: string): Promise<ProfileData> {
  await connectDb()
  // One round-trip: `findOneAndUpdate` with `new: true` seeds the pre-data on
  // first access (`$setOnInsert`) and returns the (possibly just-created)
  // document — no separate insert-then-read.
  const doc = await ProfileModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, ...seedData() } },
    { upsert: true, new: true }
  ).lean<ProfileDoc>()
  // The upsert guarantees the document exists, but fall back to the raw seed if
  // a read races behind a delete so callers always get a full profile.
  return doc ? toData(doc) : seedData()
}

/** The raw fixture pre-data, for contexts without a signed-in user (defensive). */
export function defaultProfile(): ProfileData {
  return seedData()
}
