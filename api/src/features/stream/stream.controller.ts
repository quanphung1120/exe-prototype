import { Body, Controller, Delete, Get, Post, Query } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { ClerkDirectoryService } from "./clerk-directory.service.js"
import {
  CreateConversationBodyDto,
  CreateRoomBodyDto,
  RoomFreezeBodyDto,
  RoomMemberBodyDto,
  TokenBodyDto,
  UserSearchQueryDto,
  VenueChatBodyDto,
} from "./stream.dto.js"
import { StreamService } from "./stream.service.js"

// Stream Chat endpoints. The global `/api` prefix + `ClerkAuthGuard` apply
// automatically, so every route requires a signed-in user.
@Controller("stream")
export class StreamController {
  constructor(
    private readonly stream: StreamService,
    private readonly directory: ClerkDirectoryService
  ) {}

  /** Issue Stream credentials (app key + signed user token); seeds on first call. */
  @Post("token")
  token(@UserId() userId: string, @Body() body: TokenBodyDto) {
    return this.stream.issueToken(userId, body?.name, body?.image)
  }

  /** Create a room's real chat with only the host as a member — no mocks. */
  @Post("rooms")
  createRoom(@UserId() userId: string, @Body() body: CreateRoomBodyDto) {
    return this.stream.createRoomChannel(userId, body)
  }

  /** Host adds a real member to their room's chat (e.g. on approve). */
  @Post("rooms/members")
  async addMember(@UserId() userId: string, @Body() body: RoomMemberBodyDto) {
    await this.stream.addRoomMember(userId, body.channelId, body.memberId)
    return { ok: true }
  }

  /** Remove a member — host kick/decline, or a member leaving themselves. */
  @Delete("rooms/members")
  async removeMember(
    @UserId() userId: string,
    @Body() body: RoomMemberBodyDto
  ) {
    await this.stream.removeRoomMember(userId, body.channelId, body.memberId)
    return { ok: true }
  }

  /** Host freezes their room's chat on cancel — keeps history, blocks sends. */
  @Post("rooms/freeze")
  async freeze(@UserId() userId: string, @Body() body: RoomFreezeBodyDto) {
    await this.stream.freezeRoomChannel(userId, body.channelId)
    return { ok: true }
  }

  /** Find real users by name (partial) or email (exact) to start a chat with. */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Get("users/search")
  searchUsers(@UserId() userId: string, @Query() query: UserSearchQueryDto) {
    return this.directory.search(userId, query.q)
  }

  /** Start a DM (1 member) or a named group chat (2+ members). */
  @Post("conversations")
  createConversation(
    @UserId() userId: string,
    @Body() body: CreateConversationBodyDto
  ) {
    return this.stream.createConversation(userId, body)
  }

  /** Open (get-or-create) the caller's chat with a venue — needs a paid booking there. */
  @Post("venue-chats")
  openVenueChat(@UserId() userId: string, @Body() body: VenueChatBodyDto) {
    return this.stream.openVenueChat(userId, body)
  }
}
