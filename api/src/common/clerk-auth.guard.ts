import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import { clerkMiddleware, getAuth } from "@clerk/express"
import type { Request, RequestHandler, Response } from "express"

import { IS_PUBLIC_KEY } from "./public.decorator.js"

/**
 * Whether a thrown auth error is the *caller's* fault (a bad token → 401) rather
 * than *our* fault (a config/infrastructure failure → 500). Folding everything
 * into 401 would tell every valid user "you're signed out" whenever the Clerk
 * secret is missing or the JWKS endpoint is unreachable, and bury the real 5xx.
 *
 * A missing / no token doesn't reach here — clerkMiddleware resolves it to a
 * signed-out state (getAuth → null) without throwing. What *does* throw:
 *  - a malformed/undecodable token → `SyntaxError` during JWT base64/JSON decode
 *  - an invalid token Clerk actively rejected → `TokenVerificationError` whose
 *    `reason` is token-content (expired, bad signature, …)
 * Both are the caller's fault → 401. Everything else — a missing secret key, a
 * network failure, or a JWKS/remote-key `TokenVerificationError` — is ours → 500.
 */
function isCallerAuthError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true
  if (err instanceof Error && err.name === "TokenVerificationError") {
    const reason = (err as { reason?: string }).reason ?? ""
    // JWK/remote/secret-key reasons are infrastructure, not the token → 500.
    return !/JWK|Remote|Resolve|SecretKey/i.test(reason)
  }
  return false
}

/**
 * Global guard: reject anonymous callers on every route except those marked
 * `@Public()` (e.g. /health). Dashboard data is shared demo data, so we don't
 * scope rows by user — we only require *a* signed-in user. CORS preflight
 * (OPTIONS) is short-circuited by the cors middleware before the guard runs.
 *
 * The Clerk secret/publishable keys are read via ConfigService (which forces
 * ConfigModule to load `.env` before this guard is constructed) and passed
 * explicitly to clerkMiddleware.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly clerk: RequestHandler

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService
  ) {
    this.clerk = clerkMiddleware({
      secretKey: config.get<string>("CLERK_SECRET_KEY"),
      publishableKey: config.get<string>("CLERK_PUBLISHABLE_KEY"),
    })
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()

    // Run clerkMiddleware manually with a no-op-style callback so it populates
    // the auth state (getAuth) but doesn't advance to the route — then gate on
    // the result. A thrown error is classified: the caller's bad token → 401,
    // our config/infra failure → rethrow so the filter returns 500 instead of
    // masking an outage as "everyone is signed out".
    let userId: string | null | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        this.clerk(req, res, (err?: unknown) => (err ? reject(err) : resolve()))
      })
      userId = getAuth(req).userId
    } catch (err) {
      if (!isCallerAuthError(err)) throw err
      userId = undefined
    }

    if (!userId) throw new UnauthorizedException()
    return true
  }
}
