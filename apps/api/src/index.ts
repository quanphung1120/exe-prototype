import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { courts } from "./routes/courts.js"
import { player } from "./routes/player.js"
import { seed } from "./routes/seed.js"
import { venue } from "./routes/venue.js"
import { venues } from "./routes/venues.js"

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
  .get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))
  .route("/api/seed", seed)
  .route("/api/courts", courts)
  .route("/api", player)
  .route("/api/venues", venues)
  .route("/api/venue", venue)

// Export the route type for end-to-end RPC inference. A future internal package
// can `import type { AppType }` from the api and call `hc<AppType>()`.
export type AppType = typeof routes

const port = Number(process.env.PORT ?? 6969)

const server = serve({ fetch: routes.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

// Graceful shutdown so `tsx watch` restarts and container stops are clean.
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`)
  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

export default routes
