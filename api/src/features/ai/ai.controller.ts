import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from "@nestjs/common"
import type { Response } from "express"

import { UserId } from "../../common/user-id.decorator.js"
import { AiChatDto } from "./ai-chat.dto.js"
import { AiService } from "./ai.service.js"
import { allowRequest } from "./chat-rate-limit.js"

// POST /api/ai/chat — the AI chat backend. Called directly by the browser
// (CORS-allowed from WEB_URL, Clerk Bearer token attached client-side); the
// global ClerkAuthGuard requires a signed-in user. On top of the global
// per-IP ThrottlerGuard, this route also enforces a per-user 10/min limit
// (see chat-rate-limit.ts) since it's a paid-LLM endpoint. Streams a
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
    if (!allowRequest(userId)) {
      // Set before the throw: AllExceptionsFilter reuses this Response, so the
      // header survives onto the { error } JSON it renders.
      res.setHeader("Retry-After", "60")
      throw new HttpException(
        "Too many requests — thử lại sau một phút nhé.",
        HttpStatus.TOO_MANY_REQUESTS
      )
    }

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
