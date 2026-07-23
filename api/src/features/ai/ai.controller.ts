import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common"
import type { Response } from "express"

import { UserId } from "../../common/user-id.decorator.js"
import {
  UserThrottle,
  UserThrottlerGuard,
} from "../../common/user-throttler.guard.js"
import { AiChatDto } from "./ai-chat.dto.js"
import { AiService } from "./ai.service.js"

// POST /api/ai/chat — the AI chat backend. Called directly by the browser
// (CORS-allowed from WEB_URL, Clerk Bearer token attached client-side); the
// global ClerkAuthGuard requires a signed-in user. On top of the global
// per-IP ThrottlerGuard, this route also enforces a per-user 10/min limit
// via UserThrottlerGuard (src/common/user-throttler.guard.ts) since it's a
// paid-LLM endpoint. Streams a UI-message stream via the AI SDK's
// Node/Express helper.
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 10, ttl: 60_000 })
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
