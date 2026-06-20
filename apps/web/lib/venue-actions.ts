"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import type { SportKey, Venue, VenueCourt } from "@repo/shared"

import { ACTIVE_VENUE_COOKIE } from "@/lib/api"

// Server actions for venue management. They run on the server (so the Hono API
// base and the active-venue cookie stay off the client) and call the API's CRUD
// routes, then revalidate the dashboard so the server-rendered seed refetches.

const API_URL = process.env.API_URL ?? "http://localhost:8080"

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Refresh every dashboard surface (the seed is fetched in the shared layout). */
function refreshDashboard() {
  revalidatePath("/", "layout")
}

export interface VenueInput {
  name: string
  district: string
  city: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  managerName: string
}

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
}

export async function createVenue(input: VenueInput): Promise<Venue> {
  const venue = await api<Venue>("/api/venues", {
    method: "POST",
    body: JSON.stringify(input),
  })
  // Make the freshly created venue the active one.
  ;(await cookies()).set(ACTIVE_VENUE_COOKIE, venue.id, { path: "/" })
  refreshDashboard()
  return venue
}

export async function updateVenue(
  id: string,
  input: Partial<VenueInput>
): Promise<Venue> {
  const venue = await api<Venue>(`/api/venues/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
  refreshDashboard()
  return venue
}

export async function deleteVenue(id: string): Promise<void> {
  await api(`/api/venues/${id}`, { method: "DELETE" })
  // If the deleted venue was active, drop the cookie so the layout falls back.
  const store = await cookies()
  if (store.get(ACTIVE_VENUE_COOKIE)?.value === id) {
    store.delete(ACTIVE_VENUE_COOKIE)
  }
  refreshDashboard()
}

export async function addCourt(
  venueId: string,
  input: CourtInput
): Promise<VenueCourt> {
  const court = await api<VenueCourt>(`/api/venues/${venueId}/courts`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  refreshDashboard()
  return court
}

export async function updateCourt(
  venueId: string,
  courtId: string,
  input: Partial<CourtInput>
): Promise<VenueCourt> {
  const court = await api<VenueCourt>(
    `/api/venues/${venueId}/courts/${courtId}`,
    { method: "PUT", body: JSON.stringify(input) }
  )
  refreshDashboard()
  return court
}

export async function deleteCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/courts/${courtId}`, { method: "DELETE" })
  refreshDashboard()
}

/** Switch which venue the whole dashboard is scoped to (persisted in a cookie). */
export async function setActiveVenue(id: string): Promise<void> {
  ;(await cookies()).set(ACTIVE_VENUE_COOKIE, id, { path: "/" })
  refreshDashboard()
}
