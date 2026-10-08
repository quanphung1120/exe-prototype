import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type {
  PlayerAssessment as PlayerAssessmentData,
  PlayerSkillLevel,
} from "../../shared/index.js"

import {
  PlayerAssessment,
  type PlayerAssessmentDocument,
} from "./assessment.schema.js"

// MongoDB-backed service for a player's skills assessment. One document per Clerk
// user; reads feed the seed merge, writes are driven by the web's saveAssessment
// action. There's no shared seed to insert — a user simply has no assessment
// until they take it.
@Injectable()
export class AssessmentService {
  constructor(
    @InjectModel(PlayerAssessment.name)
    private readonly assessmentModel: Model<PlayerAssessmentDocument>
  ) {}

  /** This user's persisted assessment, or null when they haven't taken it. */
  async getUserAssessment(
    userId: string
  ): Promise<PlayerAssessmentData | null> {
    const doc = await this.assessmentModel.findOne({ userId }).lean()
    return doc?.data ?? null
  }

  /**
   * Another player's level per assessed sport, for their profile — only the
   * level and score; the raw answers stay private. Empty until they take it.
   */
  async getPublicLevels(userId: string): Promise<PlayerSkillLevel[]> {
    const assessment = await this.getUserAssessment(userId)
    return Object.values(assessment?.results ?? {}).flatMap((r) =>
      r?.bucket ? [{ sport: r.sport, level: r.bucket, score: r.score }] : []
    )
  }

  /** Insert or replace this user's assessment (one row per user). */
  async saveUserAssessment(
    userId: string,
    assessment: PlayerAssessmentData
  ): Promise<PlayerAssessmentData> {
    await this.assessmentModel.updateOne(
      { userId },
      { $set: { data: assessment } },
      { upsert: true }
    )
    return assessment
  }
}
