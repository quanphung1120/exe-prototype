import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import {
  RoomIdParamDto,
  RoomRequestDecisionBodyDto,
  RoomRequestParamDto,
} from "./rooms.dto.js"
import { RoomsService } from "./rooms.service.js"

// Cross-user room browsing/coordination (VienTD-Review Phase 9 G2). The
// global `/api` prefix + `ClerkAuthGuard` apply automatically, so every
// route requires a signed-in user — beyond that, `RoomsService` enforces who
// may act on which room (host-only decisions, self-only leave).
@Controller("rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** Every listed, non-demo, still-open room across all users. */
  @Get()
  list() {
    return this.rooms.listRooms()
  }

  /** Ask to join a room — takes a `requested` seat pending the host's decision. */
  @Post(":id/requests")
  async request(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.requestJoin(userId, param.id)
    return { ok: true }
  }

  /** Host approves/declines a pending join request. */
  @Put(":id/requests/:userId")
  async decide(
    @UserId() hostUserId: string,
    @Param() param: RoomRequestParamDto,
    @Body() body: RoomRequestDecisionBodyDto
  ) {
    await this.rooms.decideRequest(
      hostUserId,
      param.id,
      param.userId,
      body.decision
    )
    return { ok: true }
  }

  /** A confirmed member leaves the room on their own. */
  @Delete(":id/members/me")
  async leave(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.leaveRoom(userId, param.id)
    return { ok: true }
  }
}
