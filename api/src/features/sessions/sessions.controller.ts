import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
} from "@nestjs/common"
import * as z from "zod"

import type { PlaySession as PlaySessionData } from "../../shared/index.js"

import { UserId } from "../../common/user-id.decorator.js"
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js"
import { SessionsService } from "./sessions.service.js"

const idParam = z.object({ id: z.string().min(1) })

// A user's persisted PlaySessions (the durable mirror of their client-side
// booking/matchmaking activity). The full session shape is owned by the web
// client, so the PUT body is read directly rather than through a schema that
// would strip unknown keys — the route asserts the path id, the handler checks
// the body id matches.
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.sessions.listUserSessions(userId)
  }

  @Put(":id")
  put(
    @UserId() userId: string,
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>,
    @Body() body: PlaySessionData
  ) {
    if (!body || typeof body !== "object" || body.id !== param.id) {
      throw new BadRequestException("Body id must match path id")
    }
    return this.sessions.upsertSession(userId, body)
  }

  @Delete(":id")
  async remove(
    @UserId() userId: string,
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>
  ) {
    await this.sessions.deleteSession(userId, param.id)
    return { ok: true }
  }
}
