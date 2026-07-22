import "server-only"

import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import { createFetch } from "@better-fetch/fetch"

import type {
  AccountType,
  PlayerAssessment,
  Seed,
  VenueSeed,
} from "@/lib/shared"

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

/** Stream Chat credentials handed to the web client (app key + signed user token). */
export interface StreamCredentials {
  apiKey: string
  token: string
}

/**
 * Fetch the signed-in user's Stream Chat credentials from the API (which also
 * seeds their demo channels on first call). The Stream *app key* is returned in
 * the response body — it never lives in a `NEXT_PUBLIC_*` var, so nothing Stream
 * is inlined at build time. Returns `null` on any failure (Stream down or
 * unconfigured) so the dashboard still renders — the chat page degrades to an
 * "unavailable" state rather than hard-failing the whole layout.
 */
export async function fetchStreamCredentials(user: {
  name: string
  image?: string | null
}): Promise<StreamCredentials | null> {
  try {
    return await apiFetch<StreamCredentials>("/api/stream/token", {
      method: "POST",
      body: { name: user.name, image: user.image ?? undefined },
    })
  } catch {
    return null
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

/**
 * Fetch the signed-in account's effective account type (null until chosen).
 * Used by the standalone `/onboarding` and `/assessment` routes, which live
 * outside the dashboard layout and so don't receive the seed. The dashboard
 * itself reads it from the seed (`Seed.accountType`) instead.
 */
export async function fetchAccountType(): Promise<AccountType | null> {
  try {
    const { accountType } = await apiFetch<{ accountType: AccountType | null }>(
      "/api/account"
    )
    return accountType
  } catch {
    throw new Error(`Failed to load account type. Is the API running?`)
  }
}

/**
 * Fetch the account's default (first) branch bundle, or null when it has
 * provisioned none yet (404). Used by the bare-venue redirect and the setup-page
 * gate to decide between the workspace and the setup wizard — the presence of
 * *any* branch is the "has a venue" signal.
 */
export async function fetchMyVenue(): Promise<VenueSeed | null> {
  const { data, error } = await apiFetchSafe<VenueSeed>("/api/venue/bundle")
  if (error?.status === 404) return null
  if (error) {
    throw new Error(
      `Failed to load venue data (${error.status}). Is the API running?`
    )
  }
  return data
}

/**
 * Fetch one branch's full venue-operator bundle for the venue workspace. The
 * branch is the `[venueId]` segment of the `/dashboard/venue/[venueId]` URL; the
 * API authorizes the caller owns it. A 404 (unknown venue) or 403 (another
 * account's) both surface the not-found page — the dashboard layout redirects
 * fresh accounts to setup first, and the switcher only ever offers owned branches.
 */
export async function fetchVenueBundle(venueId: string): Promise<VenueSeed> {
  // One aggregate request — the API assembles the whole VenueSeed server-side
  // (mirroring /api/seed), so a partial failure can't silently render a venue
  // with empty courts/reservations/analytics.
  const { data, error } = await apiFetchSafe<VenueSeed>(
    `/api/venue/${venueId}/bundle`
  )

  if (error?.status === 404 || error?.status === 403) notFound()

  if (error) {
    throw new Error(
      `Failed to load venue data (${error.status}). Is the API running?`
    )
  }

  return data
}
