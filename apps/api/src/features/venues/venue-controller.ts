import type { Context } from "hono"

import { activeBundle, venueBundle } from "./service.js"

// Venue-workspace (operator) read endpoints, backed by the venue service so they
// reflect mutations. `?venue=` selects which venue's bundle to read (defaults to
// the first, except `/bundle` which throws NotFoundError → 404 on an unknown id
// — no silent fallback).
export const venueController = {
  async bundle(c: Context, query: { venue: string }) {
    return c.json(await venueBundle(query.venue))
  },

  async summary(c: Context, query: { venue?: string }) {
    const b = await activeBundle(query.venue)
    return c.json({ venue: b.info, stats: b.stats })
  },

  async courts(c: Context, query: { venue?: string }) {
    return c.json((await activeBundle(query.venue)).courts)
  },

  async reservations(c: Context, query: { venue?: string }) {
    return c.json((await activeBundle(query.venue)).reservations)
  },

  async customers(c: Context, query: { venue?: string }) {
    return c.json((await activeBundle(query.venue)).customers)
  },

  async analytics(c: Context, query: { venue?: string }) {
    const b = await activeBundle(query.venue)
    return c.json({
      stats: b.stats,
      revenueSeries: b.revenueSeries,
      sportMix: b.sportMix,
      channelMix: b.channelMix,
      peakHours: b.peakHours,
    })
  },

  async insights(c: Context, query: { venue?: string }) {
    return c.json((await activeBundle(query.venue)).insights)
  },
}
