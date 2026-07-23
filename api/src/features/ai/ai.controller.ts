import { Body, Controller, Post, Res } from "@nestjs/common"
import type { Response } from "express"

import { UserId } from "../../common/user-id.decorator.js"
import { AiChatDto } from "./ai-chat.dto.js"
import { AiService } from "./ai.service.js"

// POST /api/ai/chat — the AI chat backend. The global ClerkAuthGuard requires a
// signed-in user (the web proxy forwards the caller's Clerk token). Streams a
// UI-message stream via the AI SDK's Node/Express helper.
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  async chat(
    @UserId() userId: string,
    @Body() dto: AiChatDto,
    @Res() res: Response
  ): Promise<void> {
    await this.ai.streamChat({
      res,
      userId,
      messages: dto.messages,
      userLevels: dto.userLevels,
      userLocation: dto.userLocation ?? null,
      locale: dto.locale,
    })
  }
}
