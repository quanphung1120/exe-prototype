import { SetMetadata } from "@nestjs/common"
import type { ExecutionContext } from "@nestjs/common"
import {
  ThrottlerGuard,
  ThrottlerException,
  type ThrottlerRequest,
} from "@nestjs/throttler"
import type { Request } from "express"

import { IS_PUBLIC_KEY } from "./public.decorator.js"
import { getRequestUserId } from "./request-auth.js"

/**
 * Per-user rate limit, registered globally (third `APP_GUARD`, after
 * `ClerkAuthGuard`) — every authenticated route gets a shared 120/min-per-
 * user budget on top of the global per-IP guard (120/min). One signed-in
 * user rotating IPs is still capped at 120/min total; a NAT full of legit
 * users is not squeezed below what each account is individually allowed.
 * Routes carrying `@UserThrottle()` metadata (paid-LLM chat, SePay checkout
 * creation) get their own stricter per-route bucket instead of drawing from
 * the shared budget — see the two-bucket design in `handleRequest` below.
 *
 * Usage (per-route override, own bucket, own limit):
 *
 *   @UserThrottle({ limit: 10, ttl: 60_000 })
 *   @Post("chat")
 *
 * Limits come from our own `@UserThrottle()` metadata, NEVER the library's
 * `@Throttle()` decorator — the global per-IP ThrottlerGuard reads that same
 * metadata and would silently drop the route's per-IP limit too.
 *
 * This guard runs after ClerkAuthGuard in the global chain, so the userId is
 * already stashed (request-auth.ts) by the time getTracker runs; the ip
 * fallback is defense-in-depth only.
 *
 * PROTOTYPE LIMITATION: backed by the module's in-memory ThrottlerStorage —
 * per-api-instance, resets on restart. Fine for the single-instance
 * prototype; with >1 replica, swap the storage for a shared store (e.g.
 * Redis) via ThrottlerModule's `storage` option — one swap covers all three
 * throttle checks (per-IP, per-user global, per-route).
 */

export type UserThrottleOptions = { limit: number; ttl: number }

export const USER_THROTTLE_KEY = "user-throttle"

/** Per-user limit for this route: `limit` requests per `ttl` ms. */
export const UserThrottle = (options: UserThrottleOptions) =>
  SetMetadata(USER_THROTTLE_KEY, options)

// Global per-user default, deliberately equal to the per-IP layer (operator
// decision 2026-07-23) so one account rotating IPs gains nothing.
const DEFAULT_OPTIONS: UserThrottleOptions = { limit: 120, ttl: 60_000 }

export class UserThrottlerGuard extends ThrottlerGuard {
  // @Public() routes (health probes, SePay `ipn`) have no user — they stay
  // covered by the per-IP layer only.
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    return Promise.resolve(isPublic === true)
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request
    const userId = getRequestUserId(request)
    return Promise.resolve(userId ? `user:${userId}` : `ip:${request.ip}`)
  }

  protected override async handleRequest(
    props: ThrottlerRequest
  ): Promise<boolean> {
    const routeOptions = this.reflector.getAllAndOverride<
      UserThrottleOptions | undefined
    >(USER_THROTTLE_KEY, [props.context.getHandler(), props.context.getClass()])
    const { limit, ttl } = routeOptions ?? DEFAULT_OPTIONS
    // No @UserThrottle metadata → the global per-user budget: one shared
    // bucket per tracker across every route, instead of the base guard's
    // per-route key.
    const generateKey = routeOptions
      ? props.generateKey
      : (_context: ExecutionContext, tracker: string) =>
          `user-global-${tracker}`
    // blockDuration MUST be ttl: the storage layer treats 0 as "immediately
    // unblocked", which disables throttling entirely.
    return super.handleRequest({
      ...props,
      limit,
      ttl,
      blockDuration: ttl,
      generateKey,
    })
  }

  protected override throwThrottlingException(): Promise<void> {
    // Base guard already set Retry-After on the response; AllExceptionsFilter
    // reuses that Response, so the header survives onto the { error } JSON.
    return Promise.reject(
      new ThrottlerException("Too many requests — thử lại sau một phút nhé.")
    )
  }
}
