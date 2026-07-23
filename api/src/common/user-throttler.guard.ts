import { SetMetadata } from "@nestjs/common"
import {
  ThrottlerGuard,
  ThrottlerException,
  type ThrottlerRequest,
} from "@nestjs/throttler"
import type { Request } from "express"

import { getRequestUserId } from "./request-auth.js"

/**
 * Per-user rate limit for cost-sensitive routes (paid-LLM chat, SePay
 * checkout creation). The global ThrottlerGuard keys on IP — wrong for
 * bounding what one signed-in account can spend (NATs share an IP; one user
 * can rotate IPs). This subclass keys on the Clerk userId instead.
 *
 * Usage (route-scoped, layered on top of the global per-IP guard):
 *
 *   @UseGuards(UserThrottlerGuard)
 *   @UserThrottle({ limit: 10, ttl: 60_000 })
 *   @Post("chat")
 *
 * Limits come from our own `@UserThrottle()` metadata, NEVER the library's
 * `@Throttle()` decorator — the global per-IP ThrottlerGuard reads that same
 * metadata and would silently drop the route's per-IP limit too.
 *
 * Route-scoped guards run after every global guard, so ClerkAuthGuard has
 * already verified the token and stashed the userId (request-auth.ts) by the
 * time getTracker runs; the ip fallback is defense-in-depth only.
 *
 * PROTOTYPE LIMITATION: backed by the module's in-memory ThrottlerStorage —
 * per-api-instance, resets on restart. Fine for the single-instance
 * prototype; with >1 replica, swap the storage for a shared store (e.g.
 * Redis) via ThrottlerModule's `storage` option.
 */

export type UserThrottleOptions = { limit: number; ttl: number }

export const USER_THROTTLE_KEY = "user-throttle"

/** Per-user limit for this route: `limit` requests per `ttl` ms. */
export const UserThrottle = (options: UserThrottleOptions) =>
  SetMetadata(USER_THROTTLE_KEY, options)

const DEFAULT_OPTIONS: UserThrottleOptions = { limit: 10, ttl: 60_000 }

export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const request = req as unknown as Request
    const userId = getRequestUserId(request)
    return Promise.resolve(userId ? `user:${userId}` : `ip:${request.ip}`)
  }

  protected override async handleRequest(
    props: ThrottlerRequest
  ): Promise<boolean> {
    const { limit, ttl } =
      this.reflector.getAllAndOverride<UserThrottleOptions | undefined>(
        USER_THROTTLE_KEY,
        [props.context.getHandler(), props.context.getClass()]
      ) ?? DEFAULT_OPTIONS
    // blockDuration MUST be ttl: the storage layer treats 0 as "immediately
    // unblocked", which disables throttling entirely.
    return super.handleRequest({ ...props, limit, ttl, blockDuration: ttl })
  }

  protected override throwThrottlingException(): Promise<void> {
    // Base guard already set Retry-After on the response; AllExceptionsFilter
    // reuses that Response, so the header survives onto the { error } JSON.
    return Promise.reject(
      new ThrottlerException("Too many requests — thử lại sau một phút nhé.")
    )
  }
}
