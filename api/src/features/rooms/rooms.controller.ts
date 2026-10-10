import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  type MessageEvent,
  Param,
  Post,
  Put,
  Sse,
} from "@nestjs/common"
import type { Observable } from "rxjs"

import { RoomEventsService } from "./room-events.service.js"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import {
  ChannelIdParamDto,
  RoomComplaintBodyDto,
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
  // Explicit tokens: tsx-based runners don't emit the constructor metadata
  // implicit injection relies on (same note as SessionsService).
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomEventsService) private readonly roomEvents: RoomEventsService
  ) {}

  /** Every listed, non-demo, still-open room across all users. */
  @Get()
  list() {
    return this.rooms.listRooms()
  }

  /**
   * Server-sent events: a `room` event (just `{ roomId }`) whenever any room
   * is created, changed or removed, so clients refetch `GET /api/rooms`
   * right away instead of waiting for their next poll.
   */
  @Sse("events")
  events(): Observable<MessageEvent> {
    return this.roomEvents.stream()
  }

  /** The match a group chat is coordinating — any member of the chat may read it. */
  @Get("by-channel/:channelId")
  groupMatch(@UserId() userId: string, @Param() param: ChannelIdParamDto) {
    return this.rooms.groupMatch(userId, param.channelId)
  }

  /** The caller's unpaid court shares in rooms whose court the host has paid for. */
  @Get("shares/due")
  dueShares(@UserId() userId: string) {
    return this.rooms.dueShares(userId)
  }

  /** Who in a room has paid their part of the court — host and members only. */
  @Get(":id/shares")
  roomShares(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    return this.rooms.roomShares(userId, param.id)
  }

  /** Pay the caller's seat share of the court into the host's wallet. */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post(":id/share")
  async payShare(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.payShare(userId, param.id)
    return { ok: true }
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

  /** The host cancels their room — it vanishes for everyone; members are notified. */
  @Delete(":id")
  async disband(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.disbandRoom(userId, param.id)
    return { ok: true }
  }

  /** A confirmed member leaves the room on their own. */
  @Delete(":id/members/me")
  leave(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    return this.rooms.leaveRoom(userId, param.id)
  }

  /** The host answers a paid member's request to leave (approve = refund). */
  @Put(":id/leave-requests/:userId")
  async decideLeave(
    @UserId() hostUserId: string,
    @Param() param: RoomRequestParamDto,
    @Body() body: RoomRequestDecisionBodyDto
  ) {
    await this.rooms.decideLeave(
      hostUserId,
      param.id,
      param.userId,
      body.decision
    )
    return { ok: true }
  }

  /** A member complains to the platform about a refused/ignored leave request. */
  @UserThrottle({ limit: 5, ttl: 60_000 })
  @Post(":id/complaints")
  async complain(
    @UserId() userId: string,
    @Param() param: RoomIdParamDto,
    @Body() body: RoomComplaintBodyDto
  ) {
    await this.rooms.fileComplaint(userId, param.id, body.reason)
    return { ok: true }
  }
}
