import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { auth } from "./auth.js"
import { courts } from "./routes/courts.js"
import { player } from "./routes/player.js"
import { seed } from "./routes/seed.js"
import { venue } from "./routes/venue.js"
import { venues } from "./routes/venues.js"

// The Hono app and its route tree, kept free of any Node-only API (no `serve`,
// no `process.exit`, no `dotenv`) so it can run unchanged on the Vercel Edge
// runtime (see `api/index.ts`) as well as the local Node dev server (see
// `src/index.ts`). Environment variables are read from `process.env`, which
// Vercel injects on Edge and `dotenv` populates locally via `src/index.ts`.
const app = new Hono()

// The web app lives on a different origin than this API. Auth uses cookie-based
// sessions, so CORS must reflect the exact web origin and allow credentials (a
// wildcard origin is incompatible with `credentials: true`).
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

// Centralized JSON error shape. zValidator throws on bad input; HTTPException
// carries a proper status. Everything else surfaces as a 500.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: "Internal Server Error" }, 500)
})

app.notFound((c) => c.json({ error: "Not Found" }, 404))

// Build the route tree by chaining so the exported type carries every route.
const routes = app
  .get("/health", (c) => c.json({ status: "ok" }))
  // Better Auth owns everything under /api/auth/* (sign-in, sign-up, OAuth
  // callbacks, get-session, …). Hand the raw Request to its handler.
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .route("/api/seed", seed)
  .route("/api/courts", courts)
  .route("/api", player)
  .route("/api/venues", venues)
  .route("/api/venue", venue)

// Export the route type for end-to-end RPC inference. A future internal package
// can `import type { AppType }` from the api and call `hc<AppType>()`.
export type AppType = typeof routes

export default routes
