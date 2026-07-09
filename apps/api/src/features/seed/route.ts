import { Hono } from "hono"
import * as z from "zod"

import { seedController } from "./controller.js"
import { validate } from "../../lib/validate.js"

const seedQuery = z.object({
  // Which venue's operator bundle to hydrate (defaults to the first venue).
  venue: z.string().min(1).optional(),
})

// The aggregate the web app hydrates in a single request. Route wiring only;
// buildSeed composition lives in the seed service via the controller.
export const seed = new Hono().get("/", validate("query", seedQuery), (c) =>
  seedController.get(c, c.req.valid("query"))
)
