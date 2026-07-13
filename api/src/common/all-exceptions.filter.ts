import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common"
import type { Response } from "express"

/** Pull a human message out of an HttpException's (string | object) response. */
function messageOf(exception: HttpException): string {
  const response = exception.getResponse()
  if (typeof response === "string") return response
  if (response && typeof response === "object" && "message" in response) {
    const message = response.message
    if (Array.isArray(message)) return message.join("; ")
    if (typeof message === "string") return message
  }
  return exception.message
}

/**
 * Centralized JSON error shape — the single exit for every failure. Expected,
 * client-facing failures are thrown as Nest `HttpException`s (NotFound, BadRequest,
 * Conflict, Unauthorized, …) by services, controllers, the auth guard and the
 * global `ValidationPipe` (which throws BadRequest with a `message` array —
 * joined here), and render as `{ error }` at their status. Everything else is
 * unexpected → logged → 500. Mirrors the old Hono `app.onError`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions")

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({ error: messageOf(exception) })
      return
    }

    this.logger.error(exception)
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal Server Error" })
  }
}
