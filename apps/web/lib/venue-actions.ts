"use server"

import { revalidatePath } from "next/cache"
import type { SportKey, Venue, VenueCourt } from "@repo/shared"

import { API_URL } from "@/lib/api"

// Server actions for venue management. They run on the server (so the Hono API
// base stays off the client) and call the API's CRUD routes, then revalidate
// the relevant venue path so the server-rendered seed refetches.
// API_URL is shared with the seed reader (lib/api.ts) so writes hit the same
// host/port as reads.

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
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
  // Revalidate the player dashboard seed (venues list) so the sidebar updates
  revalidatePath("/dashboard", "layout")
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
  // Revalidate the specific venue path
  revalidatePath(`/dashboard/venue/${id}`, "layout")
  revalidatePath("/dashboard", "layout")
  return venue
}

export async function deleteVenue(id: string): Promise<void> {
  await api(`/api/venues/${id}`, { method: "DELETE" })
  // Revalidate the player dashboard since venues list changed
  revalidatePath("/dashboard", "layout")
}

export async function addCourt(
  venueId: string,
  input: CourtInput
): Promise<VenueCourt> {
  const court = await api<VenueCourt>(`/api/venues/${venueId}/courts`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  // Revalidate the specific venue's layout
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
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
  // Revalidate the specific venue's layout
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return court
}

export async function deleteCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/courts/${courtId}`, { method: "DELETE" })
  // Revalidate the specific venue's layout
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
}
