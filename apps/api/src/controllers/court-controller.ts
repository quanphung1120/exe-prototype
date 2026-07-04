import type { SportKey } from "@repo/shared"
import type { Context } from "hono"

import { getCourt, listCourts } from "../services/court-service.js"

// Court-finder read endpoints. Controllers receive the already-validated input
// (zod ran in the route), call the service, and shape the HTTP response; the
// route wiring stays in routes/courts.ts.
export const courtController = {
  async list(c: Context, query: { sport?: SportKey }) {
    const data = await listCourts(query.sport)
    return c.json({ data, filter: { sport: query.sport ?? null } })
  },

  async get(c: Context, param: { id: string }) {
    return c.json(await getCourt(param.id))
  },
}
