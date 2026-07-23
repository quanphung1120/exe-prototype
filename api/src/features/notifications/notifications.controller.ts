import { Controller, Get, Param, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { NotificationIdParamDto } from "./notifications.dto.js"
import { NotificationsService } from "./notifications.service.js"

// The signed-in user's transactional notification feed (VienTD-Review Phase
// 7). Scoped per-user like sessions/profile/assessment.
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.notifications.list(userId)
  }

  @Put(":id/read")
  async markRead(
    @UserId() userId: string,
    @Param() param: NotificationIdParamDto
  ) {
    await this.notifications.markRead(userId, param.id)
    return { ok: true }
  }

  @Put("read-all")
  async markAllRead(@UserId() userId: string) {
    await this.notifications.markAllRead(userId)
    return { ok: true }
  }
}
