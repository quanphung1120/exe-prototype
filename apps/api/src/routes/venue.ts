import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import * as z from "zod"

import { activeBundle } from "../store/venue-store.js"

const venueQuery = z.object({ venue: z.string().min(1).optional() })

// Venue-workspace (operator) read resources, backed by the in-memory store so
// they reflect mutations. `?venue=` selects which venue's bundle to read
// (defaults to the first). Chained for RPC type inference.
export const venue = new Hono()
  .get("/", zValidator("query", venueQuery), (c) => {
    const b = activeBundle(c.req.valid("query").venue)
    return c.json({ venue: b.info, stats: b.stats })
  })
  .get("/courts", zValidator("query", venueQuery), (c) =>
    c.json(activeBundle(c.req.valid("query").venue).courts)
  )
  .get("/reservations", zValidator("query", venueQuery), (c) =>
    c.json(activeBundle(c.req.valid("query").venue).reservations)
  )
  .get("/customers", zValidator("query", venueQuery), (c) =>
    c.json(activeBundle(c.req.valid("query").venue).customers)
  )
  .get("/analytics", zValidator("query", venueQuery), (c) => {
    const b = activeBundle(c.req.valid("query").venue)
    return c.json({
      stats: b.stats,
      revenueSeries: b.revenueSeries,
      sportMix: b.sportMix,
      channelMix: b.channelMix,
      peakHours: b.peakHours,
    })
  })
  .get("/insights", zValidator("query", venueQuery), (c) =>
    c.json(activeBundle(c.req.valid("query").venue).insights)
  )
