import "server-only"

import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import { createFetch } from "@better-fetch/fetch"

import type { PlayerAssessment, Seed, Venue, VenueSeed } from "@/lib/shared"

// Where the Hono API lives. Server-side fetch only (no CORS concerns); override
// with API_URL in deployment. Single source of truth — server actions import it
// too, so reads and writes can never drift to different ports.
export const API_URL = process.env.API_URL ?? "http://localhost:6969"

// Applied to every server-side fetch below so a hung/unreachable API fails
// fast instead of hanging the request indefinitely (the dashboard layout is
// `force-dynamic`, so a stuck fetch here stalls the whole page render).
export const API_TIMEOUT_MS = 8_000

/**
 * Shared better-fetch instance for every server-side call into the Hono API.
 * Bakes in the base URL, timeout, no-store caching and the Clerk bearer token
 * (attached per-request via the `auth` hook, which re-reads `auth()` on every
 * call so it's always the current session's token, not one captured at module
 * init). The Hono API is guarded by @clerk/hono and rejects anonymous
 * requests with 401, so this runs only inside Clerk-middleware-matched server
 * contexts (dashboard layout, pages, server actions, /api/chat) where
 * `auth()` is available. `throw: true` makes a non-2xx response reject with a
 * `BetterFetchError` instead of returning an `{ error }` object, so callers
 * keep their existing try/catch-free shape.
 */
const sharedFetchConfig = {
  baseURL: API_URL,
  cache: "no-store" as const,
  timeout: API_TIMEOUT_MS,
  auth: {
    type: "Bearer" as const,
    token: async () => {
      const { getToken } = await auth()
      return (await getToken()) ?? ""
    },
  },
}

export const apiFetch = createFetch({ ...sharedFetchConfig, throw: true })

/**
 * Same instance without `throw: true`, for the one caller (`fetchVenueBundle`)
 * that needs to branch on a 404 instead of catching an error.
 */
const apiFetchSafe = createFetch(sharedFetchConfig)

/**
 * Fetch player-scoped dashboard seed from the Hono API. Called once in the
 * shared dashboard layout (a server component) and handed to the client `DataProvider`.
 */
export async function fetchSeed(): Promise<Seed> {
  try {
    return await apiFetch<Seed>("/api/seed")
  } catch {
    throw new Error(
      `Failed to load dashboard seed from ${API_URL}/api/seed. ` +
        `Is the API running? (pnpm dev / pnpm --filter api dev)`
    )
  }
}

/**
 * Fetch the signed-in player's persisted skills assessment (null until taken).
 * Used by the standalone `/assessment` wizard route, which lives outside the
 * dashboard layout and so doesn't receive the seed. The dashboard itself reads
 * the assessment from the seed (`Seed.assessment`) instead.
 */
export async function fetchAssessment(): Promise<PlayerAssessment | null> {
  try {
    return await apiFetch<PlayerAssessment | null>("/api/assessment")
  } catch {
    throw new Error(`Failed to load assessment. Is the API running?`)
  }
}

/** Fetch the operator's venue profiles (for the bare-venue redirect). */
export async function fetchVenues(): Promise<Venue[]> {
  try {
    return await apiFetch<Venue[]>("/api/venues")
  } catch {
    throw new Error(`Failed to load venues. Is the API running?`)
  }
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
  const { data, error } = await apiFetchSafe<VenueSeed>("/api/venue/bundle", {
    query: { venue: venueId },
  })

  // Unknown/stale/typo'd id — render the not-found page rather than another
  // venue's data under the wrong URL.
  if (error?.status === 404) notFound()

  if (error) {
    throw new Error(
      `Failed to load venue data for ${venueId} (${error.status}). Is the API running?`
    )
  }

  return data
}
