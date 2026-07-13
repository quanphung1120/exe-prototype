import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common"
import type { Request } from "express"

import { getRequestUserId } from "./request-auth.js"

/**
 * Injects the signed-in Clerk user id into a handler param. The global
 * ClerkAuthGuard already verified the Bearer token and stashed the id on the
 * request, so this just reads it back (and defends with a 401 if somehow
 * missing).
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>()
    const userId = getRequestUserId(req)
    if (!userId) throw new UnauthorizedException()
    return userId
  }
)
