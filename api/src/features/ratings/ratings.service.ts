import { randomUUID } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { RatingSummary } from "../../shared/index.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { ProfileService } from "../players/profile.service.js"
import { isSessionEnded, sessionParticipantIds } from "../rooms/group-match.js"
import {
  PlaySession,
  type PlaySessionDocument,
} from "../sessions/session.schema.js"
import { Rating, type RatingDocument } from "./rating.schema.js"

/** Newest reviews included in a profile summary. */
const SUMMARY_RECENT = 5

/** Mongo duplicate-key error code (the unique rater/ratee/session index). */
const DUPLICATE_KEY = 11000

/**
 * Peer ratings after a played match. A player may rate each other player
 * they actually played with — both must be participants of the session (the
 * host or a confirmed real roster member), the match must be over, and each
 * (rater, ratee, match) is rated once. Profiles read the aggregate.
 */
@Injectable()
export class RatingsService {
  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    @Inject(ProfileService)
    private readonly profiles: ProfileService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService
  ) {}

  /** Leave a review for a fellow player of a finished match. */
  async rate(
    raterId: string,
    input: {
      sessionId: string
      rateeId: string
      stars: number
      comment?: string
    }
  ): Promise<void> {
    if (raterId === input.rateeId) {
      throw new BadRequestException("Bạn không thể tự đánh giá mình")
    }
    // The host owns the session doc; members never persist a copy, but take
    // the oldest defensively so the pick is deterministic.
    const doc = await this.sessionModel
      .findOne({ sessionId: input.sessionId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<PlaySessionDocument>()
    if (!doc) throw new NotFoundException("Không tìm thấy trận đấu")
    if (doc.data.status === "cancelled") {
      throw new BadRequestException("Trận đấu đã bị huỷ")
    }
    if (!isSessionEnded(doc.data, Date.now())) {
      throw new BadRequestException("Chỉ có thể đánh giá sau khi trận kết thúc")
    }
    const participants = sessionParticipantIds(doc.userId, doc.data)
    if (!participants.includes(raterId)) {
      throw new ForbiddenException("Bạn không tham gia trận đấu này")
    }
    if (!participants.includes(input.rateeId)) {
      throw new BadRequestException("Người này không tham gia trận đấu")
    }

    const rater = await this.profiles.getProfile(raterId)
    const comment = input.comment?.trim()
    try {
      await this.ratingModel.create({
        raterId,
        raterName: rater.user.name,
        rateeId: input.rateeId,
        sessionId: input.sessionId,
        stars: input.stars,
        ...(comment ? { comment } : {}),
      })
    } catch (err) {
      if ((err as { code?: number })?.code === DUPLICATE_KEY) {
        throw new ConflictException("Bạn đã đánh giá người này cho trận này")
      }
      throw err
    }

    await this.notifications.create(input.rateeId, {
      id: `rating-${input.sessionId}-${raterId}-${randomUUID()}`,
      kind: "rating",
      text: `${rater.user.name} đã đánh giá bạn ${input.stars}★ sau trận "${doc.data.title}".`,
    })
  }

  /** Who the caller already rated in a match (to show/disable "Rate"). */
  async mine(
    raterId: string,
    sessionId: string
  ): Promise<{ rateeId: string; stars: number }[]> {
    const docs = await this.ratingModel
      .find({ raterId, sessionId })
      .select({ rateeId: 1, stars: 1 })
      .lean()
    return docs.map((d) => ({ rateeId: d.rateeId, stars: d.stars }))
  }

  /** A player's average + count and newest reviews, for their profile. */
  async summary(userId: string): Promise<RatingSummary> {
    const [agg] = await this.ratingModel.aggregate<{
      average: number
      count: number
    }>([
      { $match: { rateeId: userId } },
      {
        $group: { _id: null, average: { $avg: "$stars" }, count: { $sum: 1 } },
      },
    ])
    if (!agg?.count) return { average: 0, count: 0, recent: [] }
    const recent = await this.ratingModel
      .find({ rateeId: userId })
      .sort({ createdAt: -1 })
      .limit(SUMMARY_RECENT)
      .lean()
    return {
      average: Math.round(agg.average * 10) / 10,
      count: agg.count,
      recent: recent.map((r) => ({
        stars: r.stars,
        ...(r.comment ? { comment: r.comment } : {}),
        raterName: r.raterName,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    }
  }
}
