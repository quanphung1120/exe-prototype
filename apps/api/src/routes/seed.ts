import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import * as z from "zod"

import { buildSeed } from "../data/seed.js"

const seedQuery = z.object({
  // Which venue's operator bundle to hydrate (defaults to the first venue).
  venue: z.string().min(1).optional(),
})

// The aggregate the web app hydrates in a single request. Resource routes above
// expose the same records individually; this bundles them for the dashboard's
// one-shot server-side seed.
export const seed = new Hono().get("/", zValidator("query", seedQuery), (c) => {
  const { venue } = c.req.valid("query")
  return c.json(buildSeed(venue))
})
