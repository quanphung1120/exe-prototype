import { Inject, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  initialsOf,
  type Player as PlayerType,
  type PlayerAssessment as PlayerAssessmentData,
} from "../../shared/index.js"
import {
  PlayerAssessment,
  type PlayerAssessmentDocument,
} from "../assessment/assessment.schema.js"
import { ClerkDirectoryService } from "../stream/clerk-directory.service.js"

import { Player, toPlayer, type PlayerDocument } from "./player.schema.js"
import { Profile, type ProfileDocument } from "./profile.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

// MongoDB-backed player (match-suggestion) pool. Nothing is seeded any more —
// the old hardcoded demo players were removed, so the pool only ever holds
// real entries.
@Injectable()
export class PlayerService {
  constructor(
    @InjectModel(Player.name)
    private readonly playerModel: Model<PlayerDocument>,
    @InjectModel(PlayerAssessment.name)
    private readonly assessmentModel: Model<PlayerAssessmentDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  /**
   * Real people the player can be matched with: accounts that finished the
   * skills assessment (that is what gives them a level) and still exist in
   * Clerk, excluding the caller. Name and photo come from Clerk so a deleted
   * account never shows up as a ghost.
   */
  async listRealPlayers(excludeUserId?: string): Promise<PlayerType[]> {
    const assessed = await this.assessmentModel
      .find(excludeUserId ? { userId: { $ne: excludeUserId } } : {})
      .lean<{ userId: string; data?: PlayerAssessmentData }[]>()
    const withLevel = assessed.flatMap((row) => {
      const level = row.data?.results?.badminton?.bucket
      return level ? [{ userId: row.userId, level }] : []
    })
    if (!withLevel.length) return []

    const ids = withLevel.map((row) => row.userId)
    const [profiles, people] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: ids } })
        .select("userId user")
        .lean<{ userId: string; user?: { trust?: number } }[]>(),
      this.directory.getMany(ids),
    ])
    const trustOf = new Map(profiles.map((p) => [p.userId, p.user?.trust]))
    const personOf = new Map(people.map((p) => [p.id, p]))

    return withLevel.flatMap(({ userId, level }) => {
      const person = personOf.get(userId)
      if (!person) return []
      return [
        {
          id: userId,
          name: person.name,
          initials: initialsOf(person.name),
          level,
          sport: "badminton" as const,
          // Other players' positions aren't shared, so no distance is claimed.
          distanceKm: null,
          matchPct: 0,
          trust: trustOf.get(userId) ?? 70,
          online: false,
          blurb: "",
        },
      ]
    })
  }

  /** Every match-suggestion player, oldest first. */
  async listPlayers(): Promise<PlayerType[]> {
    const docs = await this.playerModel.find().sort(ORDER).lean<Player[]>()
    return docs.map(toPlayer)
  }
}
