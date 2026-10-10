import { Inject, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  initialsOf,
  type AccountType,
  type Streak,
} from "../../shared/index.js"
import { ClerkDirectoryService } from "../stream/clerk-directory.service.js"
import {
  Profile,
  toProfileData,
  type ProfileData,
  type ProfileDocument,
} from "./profile.schema.js"

/** Weekday letters for the streak strip, Monday first (the last one is today). */
const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"]
/** The streak heatmap spans 12 weeks. */
const HISTORY_DAYS = 12 * 7

/** A streak with no activity yet. */
function emptyStreak(): Streak {
  return {
    current: 0,
    longest: 0,
    weeklyGoal: 3,
    weeklyDone: 0,
    week: WEEK_LETTERS.map((day, i) => ({
      day,
      active: false,
      sport: null,
      ...(i === WEEK_LETTERS.length - 1 ? { today: true } : {}),
    })),
    history: Array.from({ length: HISTORY_DAYS }, () => 0),
  }
}

/**
 * A brand-new account's dashboard state: their real (Clerk) name and nothing
 * else — no matches, bookings, activity or notifications until they happen.
 */
export function emptyProfileData(name: string, handle = ""): ProfileData {
  const display = name.trim()
  return {
    user: {
      name: display,
      first: display.split(/\s+/).pop() ?? "",
      initials: display ? initialsOf(display) : "",
      handle,
      province: "",
      level: "intermediate",
      trust: 100,
    },
    streak: emptyStreak(),
    stats: { matches: 0, winRate: 0, hours: 0, hoursDelta: 0 },
    rooms: [],
    bookings: [],
    activity: [],
    notifications: [],
    accountType: null,
  }
}

// MongoDB-backed profile service. A player's personal dashboard state is
// per-user: the document is created on first access, empty except for the
// account's real name (from Clerk), and their own mutations persist on top.
// Creation uses an atomic `$setOnInsert` upsert so two concurrent
// first-requests can't race.
@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  /**
   * The user's personal dashboard data, creating it on first access. Clerk is
   * only contacted for an account that has no profile yet.
   */
  async getProfile(userId: string): Promise<ProfileData> {
    const existing = await this.profileModel.findOne({ userId }).lean<Profile>()
    if (existing) return toProfileData(existing)

    const clerkUser = await this.directory.getOne(userId)
    const initial = emptyProfileData(clerkUser?.name ?? "")
    const doc = await this.profileModel
      .findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, ...initial } },
        { upsert: true, new: true }
      )
      .lean<Profile>()
    // The upsert guarantees the document exists, but fall back to the fresh
    // profile if a read races behind a delete so callers always get one.
    return doc ? toProfileData(doc) : initial
  }

  /** An empty profile, for contexts without a signed-in user (defensive). */
  defaultProfile(): ProfileData {
    return emptyProfileData("")
  }

  /** Set the user's self-declared account type, creating their profile first if needed. */
  async setAccountType(
    userId: string,
    accountType: AccountType
  ): Promise<void> {
    await this.getProfile(userId)
    await this.profileModel.updateOne({ userId }, { $set: { accountType } })
  }
}
