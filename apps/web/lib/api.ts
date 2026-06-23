import "server-only"

import { notFound } from "next/navigation"

import type { Seed, Venue, VenueSeed } from "@repo/shared"

// Where the Hono API lives. Server-side fetch only (no CORS concerns); override
// with API_URL in deployment. Single source of truth — server actions import it
// too, so reads and writes can never drift to different ports.
export const API_URL = process.env.API_URL ?? "http://localhost:6969"

/**
 * Fetch player-scoped dashboard seed from the Hono API. Called once in the
 * shared dashboard layout (a server component) and handed to the client `DataProvider`.
 */
export async function fetchSeed(): Promise<Seed> {
  const url = new URL(`${API_URL}/api/seed`)
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(
      `Failed to load dashboard seed from ${url} (${res.status}). ` +
        `Is the API running? (pnpm dev / pnpm --filter api dev)`
    )
  }
  return res.json() as Promise<Seed>
}

/** Fetch the operator's venue profiles (for the bare-venue redirect). */
export async function fetchVenues(): Promise<Venue[]> {
  const res = await fetch(new URL(`${API_URL}/api/venues`), {
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(
      `Failed to load venues (${res.status}). Is the API running?`
    )
  }
  return res.json() as Promise<Venue[]>
}

/**
 * Fetch venue-operator data for a specific venue. Called in the venue sub-layout
 * with the URL's [venueId] param. Returns the full VenueSeed needed to populate
 * the venue workspace.
 */
export async function fetchVenueBundle(venueId: string): Promise<VenueSeed> {
  // One aggregate request — the API assembles the whole VenueSeed server-side
  // (mirroring /api/seed), so a partial failure can't silently render a venue
  // with empty courts/reservations/analytics.
  const res = await fetch(
    new URL(`${API_URL}/api/venue/bundle?venue=${venueId}`),
    { cache: "no-store" }
  )

  // Unknown/stale/typo'd id — render the not-found page rather than another
  // venue's data under the wrong URL.
  if (res.status === 404) notFound()

  if (!res.ok) {
    throw new Error(
      `Failed to load venue data for ${venueId} (${res.status}). Is the API running?`
    )
  }

  return res.json() as Promise<VenueSeed>
}
