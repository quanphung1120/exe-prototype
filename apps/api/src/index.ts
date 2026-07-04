import "dotenv/config"

import { serve } from "@hono/node-server"

import { routes } from "./app.js"
import { connectDb } from "./db.js"

export type { AppType } from "./app.js"

const port = Number(process.env.PORT ?? 6969)

// Open the MongoDB connection on boot. The dashboard's data now lives in Mongo
// (seed, per-user profiles, venues, sessions), so /api/* requests genuinely
// depend on it — a DB outage fails those requests (connectDb clears its memo on
// failure, so a later request retries once the cluster is back). We don't crash
// the process on a boot-time connection failure: /health stays green and the
// connection recovers on the next request rather than requiring a restart.
connectDb()
  .then(() => console.log("MongoDB connected"))
  .catch((err: unknown) =>
    console.error(
      "MongoDB connection failed:",
      err instanceof Error ? err.message : err
    )
  )

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
