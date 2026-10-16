import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  type MessageEvent,
  Param,
  Put,
  Sse,
} from "@nestjs/common"
import type { Observable } from "rxjs"

import type { PlaySession as PlaySessionData } from "../../shared/index.js"

import { UserId } from "../../common/user-id.decorator.js"
import { IdParamDto } from "./sessions.dto.js"
import { SessionEventsService } from "./session-events.service.js"
import { SessionsService } from "./sessions.service.js"

// A user's persisted PlaySessions (the durable mirror of their client-side
// booking/matchmaking activity). The full session shape is owned by the web
// client, so the PUT body is read directly rather than through a DTO that
// would strip unknown keys — the route asserts the path id, the handler checks
// the body id matches. (`@Body() body: PlaySessionData` has metatype `Object`,
// so the global ValidationPipe leaves it untouched.)
@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    @Inject(SessionEventsService)
    private readonly sessionEvents: SessionEventsService
  ) {}

  @Get()
  list(@UserId() userId: string) {
    return this.sessions.listUserSessions(userId)
  }

  /**
   * Per-user server-sent events: a `session` event whenever the signed-in
   * player's booking statuses may have changed (venue approved/declined).
   * The event carries no data — the client refetches `GET /api/sessions`.
   * Bridged through the Next.js `GET /api/sessions/events` route (which
   * attaches the Clerk token the browser can't send directly via EventSource).
   */
  @Sse("events")
  events(@UserId() userId: string): Observable<MessageEvent> {
    return this.sessionEvents.stream(userId)
  }

  @Put(":id")
  put(
    @UserId() userId: string,
    @Param() param: IdParamDto,
    @Body() body: PlaySessionData
  ) {
    if (!body || typeof body !== "object" || body.id !== param.id) {
      throw new BadRequestException("Body id must match path id")
    }
    return this.sessions.upsertSession(userId, body)
  }

  @Delete(":id")
  async remove(@UserId() userId: string, @Param() param: IdParamDto) {
    await this.sessions.deleteSession(userId, param.id)
    return { ok: true }
  }
}
