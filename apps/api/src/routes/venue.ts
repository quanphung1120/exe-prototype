import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import * as z from "zod"

import { activeBundle, venueBundle } from "../store/venue-store.js"

const venueQuery = z.object({ venue: z.string().min(1).optional() })
const bundleQuery = z.object({ venue: z.string().min(1) })

// Venue-workspace (operator) read resources, backed by the in-memory store so
// they reflect mutations. `?venue=` selects which venue's bundle to read
// (defaults to the first). Chained for RPC type inference.
export const venue = new Hono()
  // The whole operator bundle in one request — what the per-venue workspace
  // loads. Requires a known `venue` id and 404s otherwise (no silent fallback).
  .get("/bundle", zValidator("query", bundleQuery), (c) => {
    const b = venueBundle(c.req.valid("query").venue)
    if (!b) throw new HTTPException(404, { message: "Venue not found" })
    return c.json(b)
  })
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
