import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

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
import {
  Profile,
  toProfileData,
  type ProfileData,
  type ProfileDocument,
} from "./profile.schema.js"

// MongoDB-backed profile service. A player's personal dashboard state is
// per-user: on first access the document is seeded from the hardcoded fixtures as
// their "pre-data", then their own mutations persist on top. Seeding uses an
// atomic `$setOnInsert` upsert so two concurrent first-requests can't race.
@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>
  ) {}

  /** The pre-data every new user starts from (the hardcoded demo fixtures). */
  private seedData(): ProfileData {
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

  /**
   * The user's personal dashboard data, seeding their pre-data on first access.
   * The `$setOnInsert` upsert only writes the seed when the document doesn't yet
   * exist, so a returning user keeps their persisted state untouched.
   */
  async getProfile(userId: string): Promise<ProfileData> {
    const doc = await this.profileModel
      .findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, ...this.seedData() } },
        { upsert: true, new: true }
      )
      .lean<Profile>()
    // The upsert guarantees the document exists, but fall back to the raw seed
    // if a read races behind a delete so callers always get a full profile.
    return doc ? toProfileData(doc) : this.seedData()
  }

  /** The raw fixture pre-data, for contexts without a signed-in user (defensive). */
  defaultProfile(): ProfileData {
    return this.seedData()
  }
}
