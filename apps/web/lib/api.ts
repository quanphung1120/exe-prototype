import "server-only"

import type { Seed } from "@repo/shared"

// Where the Hono API lives. Server-side fetch only (no CORS concerns); override
// with API_URL in deployment.
const API_URL = process.env.API_URL ?? "http://localhost:6969"

/**
 * Fetch the full hardcoded dataset from the Hono API. Called once in the
 * dashboard layout (a server component) and handed to the client `DataProvider`.
 * `activeVenueId` selects which venue's operator bundle the seed carries (the
 * operator may run several); it comes from a cookie the layout reads.
 */
export async function fetchSeed(activeVenueId?: string): Promise<Seed> {
  const url = new URL(`${API_URL}/api/seed`)
  if (activeVenueId) url.searchParams.set("venue", activeVenueId)
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(
      `Failed to load dashboard seed from ${url} (${res.status}). ` +
        `Is the API running? (pnpm dev / pnpm --filter api dev)`
    )
  }
  return res.json() as Promise<Seed>
}

/** Cookie holding the operator's active venue id (read by the dashboard layout). */
export const ACTIVE_VENUE_COOKIE = "venueId"
