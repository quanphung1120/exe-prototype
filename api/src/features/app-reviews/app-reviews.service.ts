import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  initialsOf,
  type AdminAppReviewRow,
  type AppReview as AppReviewData,
  type AppReviewsPublic,
  type MyAppReview,
} from "../../shared/index.js"
import { ProfileService } from "../players/profile.service.js"
import { ClerkDirectoryService } from "../stream/clerk-directory.service.js"
import { AppReview, type AppReviewDocument } from "./app-review.schema.js"

/** Stars a review needs before the landing will quote it. */
export const FEATURED_MIN_RATING = 4
/** Shortest comment worth quoting on the landing (filters "ok", "good"…). */
export const FEATURED_MIN_COMMENT = 20
/** How many quotes the landing shows. */
export const FEATURED_LIMIT = 6
/** Fallback public name when Clerk has no first/last/username. */
export const ANONYMOUS_NAME = "Người dùng Shuttio"

type ReviewLean = AppReview & { _id: unknown }

function toPublic(doc: ReviewLean): AppReviewData {
  return {
    id: String(doc._id),
    authorName: doc.authorName,
    initials: doc.initials,
    ...(doc.image ? { image: doc.image } : {}),
    role: doc.role,
    rating: doc.rating,
    comment: doc.comment,
    updatedAt: new Date(doc.updatedAt).toISOString(),
  }
}

function toMine(doc: ReviewLean): MyAppReview {
  return {
    rating: doc.rating,
    comment: doc.comment,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    hidden: doc.hidden,
  }
}

/**
 * Reviews of the app itself. Every signed-in user may leave one (editing it
 * by submitting again); the landing page reads the visible ones through the
 * public summary, and admins can hide abusive ones.
 */
@Injectable()
export class AppReviewsService {
  constructor(
    @InjectModel(AppReview.name)
    private readonly reviews: Model<AppReviewDocument>,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  /** The caller's own review, or null if they haven't left one. */
  async mine(userId: string): Promise<MyAppReview | null> {
    const doc = await this.reviews.findOne({ userId }).lean<ReviewLean>()
    return doc ? toMine(doc) : null
  }

  /**
   * Create or edit the caller's review. The display name, avatar and role are
   * refreshed on every save. An admin's hide survives an edit — `hidden` is
   * only ever set on insert here.
   */
  async upsert(
    userId: string,
    input: { rating: number; comment?: string }
  ): Promise<MyAppReview> {
    const [publicProfile, profile] = await Promise.all([
      this.directory.getPublicProfile(userId),
      this.profiles.getProfile(userId),
    ])
    const authorName = publicProfile.name ?? ANONYMOUS_NAME
    const role =
      profile.accountType === "venue" || profile.accountType === "both"
        ? "venue"
        : "player"

    const doc = await this.reviews
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            authorName,
            initials: initialsOf(authorName),
            role,
            rating: input.rating,
            comment: input.comment?.trim() ?? "",
            ...(publicProfile.image ? { image: publicProfile.image } : {}),
          },
          ...(publicProfile.image ? {} : { $unset: { image: 1 } }),
          $setOnInsert: { userId, hidden: false },
        },
        { upsert: true, new: true }
      )
      .lean<ReviewLean>()
    if (!doc) throw new NotFoundException("Không lưu được đánh giá")
    return toMine(doc)
  }

  /** The landing's slice: average + count over visible reviews, plus quotes. */
  async publicSummary(): Promise<AppReviewsPublic> {
    const [agg] = await this.reviews.aggregate<{
      average: number
      count: number
    }>([
      { $match: { hidden: false } },
      {
        $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } },
      },
    ])
    if (!agg?.count) return { average: 0, count: 0, featured: [] }

    const featured = await this.reviews
      .find({
        hidden: false,
        rating: { $gte: FEATURED_MIN_RATING },
        // A quote needs real text; $expr keeps the length check server-side.
        $expr: { $gte: [{ $strLenCP: "$comment" }, FEATURED_MIN_COMMENT] },
      })
      .sort({ rating: -1, updatedAt: -1 })
      .limit(FEATURED_LIMIT)
      .lean<ReviewLean[]>()

    return {
      average: Math.round(agg.average * 10) / 10,
      count: agg.count,
      featured: featured.map(toPublic),
    }
  }

  /** Every review, newest first — the admin moderation list. */
  async adminList(): Promise<AdminAppReviewRow[]> {
    const docs = await this.reviews
      .find()
      .sort({ updatedAt: -1 })
      .lean<ReviewLean[]>()
    return docs.map((d) => ({
      ...toPublic(d),
      userId: d.userId,
      hidden: d.hidden,
    }))
  }

  /** Hide or re-show one user's review on the landing. */
  async setHidden(userId: string, hidden: boolean): Promise<void> {
    const res = await this.reviews.updateOne({ userId }, { $set: { hidden } })
    if (!res.matchedCount) {
      throw new NotFoundException("Không tìm thấy đánh giá")
    }
  }
}
