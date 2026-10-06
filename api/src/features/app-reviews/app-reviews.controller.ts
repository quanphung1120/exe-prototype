import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common"

import { Public } from "../../common/public.decorator.js"
import { Roles } from "../../common/roles.decorator.js"
import { RolesGuard } from "../../common/roles.guard.js"
import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import {
  AppReviewUserParamDto,
  UpsertAppReviewBodyDto,
} from "./app-reviews.dto.js"
import { AppReviewsService } from "./app-reviews.service.js"

// Reviews of the app itself. The global `/api` prefix + `ClerkAuthGuard`
// apply, so the `me` routes need a signed-in user; `public` is open because
// the landing page renders for signed-out visitors.
@Controller("app-reviews")
export class AppReviewsController {
  constructor(private readonly reviews: AppReviewsService) {}

  /** Average, count and featured quotes — read by the landing page. */
  @Public()
  @Get("public")
  publicSummary() {
    return this.reviews.publicSummary()
  }

  /** The caller's own review (null until they leave one). */
  @Get("me")
  mine(@UserId() userId: string) {
    return this.reviews.mine(userId)
  }

  /** Create or edit the caller's review. */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Put("me")
  upsert(@UserId() userId: string, @Body() body: UpsertAppReviewBodyDto) {
    return this.reviews.upsert(userId, body)
  }
}

/**
 * Moderation for app reviews, under the admin workspace's `/api/admin` tree —
 * gated by the Clerk `"admin"` role like `AdminController`.
 */
@Controller("admin/app-reviews")
@Roles("admin")
@UseGuards(RolesGuard)
export class AdminAppReviewsController {
  constructor(private readonly reviews: AppReviewsService) {}

  @Get()
  list() {
    return this.reviews.adminList()
  }

  @Post(":userId/hide")
  async hide(@Param() param: AppReviewUserParamDto) {
    await this.reviews.setHidden(param.userId, true)
    return { ok: true }
  }

  @Post(":userId/show")
  async show(@Param() param: AppReviewUserParamDto) {
    await this.reviews.setHidden(param.userId, false)
    return { ok: true }
  }
}
