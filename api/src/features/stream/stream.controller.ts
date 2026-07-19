import { Body, Controller, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { ChannelBodyDto, TokenBodyDto } from "./stream.dto.js"
import { StreamService } from "./stream.service.js"

// Stream Chat endpoints. The global `/api` prefix + `ClerkAuthGuard` apply
// automatically, so both routes require a signed-in user.
@Controller("stream")
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  /** Issue Stream credentials (app key + signed user token); seeds on first call. */
  @Post("token")
  token(@UserId() userId: string, @Body() body: TokenBodyDto) {
    return this.stream.issueToken(userId, body?.name, body?.image)
  }

  /** Get-or-create a match-room / team channel with the given mock members. */
  @Post("channels")
  channels(@UserId() userId: string, @Body() body: ChannelBodyDto) {
    return this.stream.ensureRoomChannel(userId, body)
  }
}
