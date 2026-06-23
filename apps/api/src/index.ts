import "dotenv/config"

import { serve } from "@hono/node-server"

import app from "./app.js"

// Local development server. On Vercel the app is served as an Edge Function via
// `api/index.ts`; this Node entry (using `@hono/node-server`) is only used by
// `pnpm dev` and `pnpm start`. `dotenv` is loaded HERE — not in the shared
// modules — so the Edge bundle never pulls in `fs`-based dotenv.
const port = Number(process.env.PORT ?? 6969)

const server = serve({ fetch: app.fetch, port }, (info) => {
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
