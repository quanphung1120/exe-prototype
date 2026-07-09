import { clerkMiddleware, getAuth } from "@clerk/hono"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { AppError, UnauthorizedError } from "./lib/errors.js"
import { courts } from "./features/courts/route.js"
import { player } from "./features/players/route.js"
import { seed } from "./features/seed/route.js"
import { sessions } from "./features/sessions/route.js"
import { venue } from "./features/venues/venue-route.js"
import { venues } from "./features/venues/venues-route.js"

// The Hono app definition, free of server/DB side effects so it can be exercised
// directly in tests via `routes.request(...)`. The bootstrap (serve + Mongo
// connect + graceful shutdown) lives in index.ts.
const app = new Hono()

// The web app lives on a different origin (port) than this API, so CORS must
// reflect the exact web origin and allow credentials (a wildcard origin is
// incompatible with `credentials: true`).
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

app.use("*", logger())
app.use(
  "/api/*",
  cors({
    origin: WEB_URL,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
)

// Verify the caller's Clerk session on every /api/* request. The web app
// forwards the signed-in user's token as `Authorization: Bearer <token>`;
// clerkMiddleware validates it (JWT verification against the instance JWKS,
// keyed by CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY) and stashes the auth state
// on the context for getAuth() — the pattern from the @clerk/hono docs.
const clerk = clerkMiddleware()

/**
 * Whether a thrown auth error is the *caller's* fault (a bad token → 401) rather
 * than *our* fault (a config/infrastructure failure → 500). This is the split
 * the guard hinges on: folding everything into 401 would tell every valid user
 * "you're signed out" whenever CLERK_SECRET_KEY is missing or the Clerk/JWKS
 * endpoint is unreachable, and bury the real 5xx from ops.
 *
 * A missing / no token doesn't reach here — clerkMiddleware resolves it to a
 * signed-out state (getAuth → null) without throwing. What *does* throw:
 *  - a malformed/undecodable token → `SyntaxError` during JWT base64/JSON decode
 *  - an invalid token Clerk actively rejected → `TokenVerificationError` whose
 *    `reason` is token-content (expired, bad signature, …)
 * Both are the caller's fault → 401. Everything else — a plain `Error("Clerk:
 * Missing Secret Key…")`, a network `TypeError`, or a `TokenVerificationError`
 * whose `reason` points at the JWKS/remote key infrastructure — is ours → 500.
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

// Guard: reject anonymous callers. Dashboard data is shared demo data, so we
// don't scope rows by user — we only require *a* signed-in user. CORS preflight
// (OPTIONS) is short-circuited by the cors middleware above and never reaches
// here, and /health is intentionally left open for uptime checks.
app.use("/api/*", async (c, next) => {
  // Run clerkMiddleware with a no-op `next` so it populates the auth state but
  // doesn't run the route yet — then gate on the result via @clerk/hono's
  // documented getAuth check. A thrown error is classified: the caller's bad
  // token → 401, our config/infra failure → rethrow so onError returns 500
  // instead of masking an outage as "everyone is signed out".
  let userId: string | null | undefined
  try {
    await clerk(c, async () => {})
    userId = getAuth(c)?.userId
  } catch (err) {
    if (!isCallerAuthError(err)) throw err
    userId = undefined
  }
  if (!userId) {
    throw new UnauthorizedError()
  }
  await next()
})

// Centralized JSON error shape — the single exit for every failure. Expected,
// client-facing failures are thrown as `AppError` subclasses (errors.ts) by
// services, controllers, the auth guard, and the `validate` hook, and render as
// `{ error }` at their status. `HTTPException` is handled for anything in Hono
// itself that still throws one. Everything else is unexpected → logged → 500.
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.status)
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: "Internal Server Error" }, 500)
})

app.notFound((c) => c.json({ error: "Not Found" }, 404))

// Build the route tree by chaining so the exported type carries every route.
export const routes = app
  .get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))
  .route("/api/seed", seed)
  .route("/api/courts", courts)
  .route("/api/sessions", sessions)
  .route("/api", player)
  .route("/api/venues", venues)
  .route("/api/venue", venue)

// Export the route type for end-to-end RPC inference. A future internal package
// can `import type { AppType }` from the api and call `hc<AppType>()`.
export type AppType = typeof routes
