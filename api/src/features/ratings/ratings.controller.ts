import { Body, Controller, Get, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import {
  CreateRatingBodyDto,
  SessionIdParamDto,
  UserIdParamDto,
} from "./ratings.dto.js"
import { RatingsService } from "./ratings.service.js"

// Peer ratings after a played match. The global `/api` prefix +
// `ClerkAuthGuard` apply, so every route needs a signed-in user;
// `RatingsService` enforces who may rate whom.
@Controller("ratings")
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  /** Rate a fellow player of a finished match (once per player per match). */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Post()
  async rate(@UserId() userId: string, @Body() body: CreateRatingBodyDto) {
    await this.ratings.rate(userId, body)
    return { ok: true }
  }

  /** The caller's own ratings in one match. */
  @Get("sessions/:sessionId/mine")
  mine(@UserId() userId: string, @Param() param: SessionIdParamDto) {
    return this.ratings.mine(userId, param.sessionId)
  }

  /** Any player's rating summary — shown on their profile. */
  @Get("users/:userId/summary")
  summary(@Param() param: UserIdParamDto) {
    return this.ratings.summary(param.userId)
  }
}
