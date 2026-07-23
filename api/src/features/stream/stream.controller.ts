import { Body, Controller, Delete, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import {
  CreateRoomBodyDto,
  RoomFreezeBodyDto,
  RoomMemberBodyDto,
  TokenBodyDto,
} from "./stream.dto.js"
import { StreamService } from "./stream.service.js"

// Stream Chat endpoints. The global `/api` prefix + `ClerkAuthGuard` apply
// automatically, so every route requires a signed-in user.
@Controller("stream")
export class StreamController {
  constructor(private readonly stream: StreamService) {}

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
}
