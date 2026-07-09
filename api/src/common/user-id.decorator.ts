import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common"
import { getAuth } from "@clerk/express"
import type { Request } from "express"

/**
 * Injects the signed-in Clerk user id into a handler param. The global
 * ClerkAuthGuard already rejected anonymous callers, so getAuth is populated by
 * the time a controller runs — this re-read just narrows the id (and defends
 * with a 401 if somehow missing).
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>()
    const userId = getAuth(req)?.userId
    if (!userId) throw new UnauthorizedException()
    return userId
  }
)
