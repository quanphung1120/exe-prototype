import { getAuth } from "@clerk/hono"

import type { Context } from "hono"

import { buildSeed } from "./service.js"

// The aggregate the web hydrates in one request. `?venue=` selects which venue's
// operator bundle to include; the signed-in user's id (guaranteed by the /api/*
// guard) drives the personal half of the seed via buildSeed.
export const seedController = {
  async get(c: Context, query: { venue?: string }) {
    const userId = getAuth(c)?.userId ?? undefined
    return c.json(await buildSeed(query.venue, userId))
  },
}
