import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import { verifyToken } from "@clerk/express"
import type { Request } from "express"

import { IS_PUBLIC_KEY } from "./public.decorator.js"
import {
  setRequestRole,
  setRequestUserId,
  type ClerkRole,
} from "./request-auth.js"

/**
 * Whether a `verifyToken` throw is the *caller's* fault (a bad token → 401)
 * rather than *ours* (a config/infrastructure failure → 500). Folding
 * everything into 401 would tell every valid user "you're signed out" whenever
 * the Clerk secret is missing or the JWKS endpoint is unreachable, and bury the
 * real 5xx.
 *
 * verifyToken throws a `TokenVerificationError` whose `reason` is a stable slug
 * (or a `SyntaxError` when the token isn't even decodable base64/JSON). Every
 * infra failure surfaces as a `jwk-*` reason (the JWKS couldn't be
 * loaded/resolved/matched) or `secret-key-invalid`; everything else — a
 * malformed, expired, mis-signed, or not-yet-active token — is the caller's
 * fault. We duck-type on `reason` rather than `instanceof` so we needn't import
 * from the transitive `@clerk/backend`.
 */
function isInfraFailure(err: unknown): boolean {
  const reason = (err as { reason?: string })?.reason ?? ""
  return reason.startsWith("jwk-") || reason === "secret-key-invalid"
}

/**
 * Global guard: reject anonymous callers on every route except those marked
 * `@Public()` (e.g. /health). Dashboard data is shared demo data, so we don't
 * scope rows by user — we only require *a* signed-in user. CORS preflight
 * (OPTIONS) is short-circuited by the cors middleware before the guard runs.
 *
 * The web app forwards its Clerk session token as a `Bearer` header (never a
 * Clerk cookie), so we read the `Authorization` header directly and hand the
 * token to `verifyToken` — no request/response mutation, no middleware to drive.
 * The secret key (read via ConfigService, so ConfigModule loads `.env` first)
 * lets `verifyToken` fetch and cache the instance JWKS.
 *
 * RBAC (basic-rbac, https://clerk.com/docs/guides/secure/basic-rbac): a role
 * is granted purely in the Clerk dashboard (`publicMetadata.role`), never by
 * this app. It only reaches the verified JWT payload because the Clerk
 * dashboard's session-token customization (Sessions → Customize session
 * token) adds `{ "metadata": "{{user.public_metadata}}" }` — without that
 * claim, `payload.metadata` is simply absent and every caller is treated as
 * roleless. `RolesGuard` (roles.guard.ts) reads the role stashed here to gate
 * `@Roles("admin")` routes.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly secretKey: string

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService
  ) {
    // env.validation.ts already crashed the boot if this were missing.
    this.secretKey = config.get<string>("CLERK_SECRET_KEY") ?? ""
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<Request>()

    const header = req.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
    if (!token) throw new UnauthorizedException()

    // verifyToken validates the JWT against the instance JWKS and returns its
    // payload, or throws. A bad token → 401; a JWKS/secret-key failure is
    // rethrown so AllExceptionsFilter logs it and returns 500 instead of masking
    // an outage as "everyone is signed out".
    let userId: string
    let role: ClerkRole | undefined
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey })
      userId = payload.sub
      // `metadata` only exists when the session-token customization above is
      // configured — duck-typed (like `isInfraFailure`) since the JWT payload
      // type carries no field for an app-defined custom claim.
      role = (payload as { metadata?: { role?: ClerkRole } }).metadata?.role
    } catch (err) {
      if (isInfraFailure(err)) throw err
      throw new UnauthorizedException()
    }

    setRequestUserId(req, userId)
    setRequestRole(req, role)
    return true
  }
}
