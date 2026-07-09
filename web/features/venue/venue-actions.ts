"use server"

import { revalidatePath } from "next/cache"
import type {
  Reservation,
  ReservationStatus,
  SportKey,
  Venue,
  VenueCourt,
  VenueCustomer,
} from "@/lib/shared"

import { API_URL, authHeaders } from "@/lib/api"

// Server actions for venue management. They run on the server (so the Hono API
// base stays off the client) and call the API's CRUD routes, then revalidate
// the relevant venue path so the server-rendered seed refetches.
// API_URL is shared with the seed reader (lib/api.ts) so writes hit the same
// host/port as reads; authHeaders() forwards the Clerk token the API requires.

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(await authHeaders()),
      ...init?.headers,
    },
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
  image?: string
  description?: string
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

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

export async function createVenue(input: VenueInput): Promise<Venue> {
  const venue = await api<Venue>("/api/venues", {
    method: "POST",
    body: JSON.stringify(input),
  })
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
  revalidatePath(`/dashboard/venue/${id}`, "layout")
  revalidatePath("/dashboard", "layout")
  return venue
}

export async function deleteVenue(id: string): Promise<void> {
  await api(`/api/venues/${id}`, { method: "DELETE" })
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
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return court
}

export async function deleteCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/courts/${courtId}`, { method: "DELETE" })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
}

export async function addWalkInReservation(
  venueId: string,
  input: WalkInReservationInput
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/walk-in`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return reservation
}

// ── Reservation status transitions ───────────────────────────────────────────
// One endpoint backs every status change; these are thin, intent-named wrappers
// the operator surfaces call (approve/decline reservations, check in an arrival,
// cancel a scheduled booking).

async function setReservationStatus(
  venueId: string,
  reservationId: string,
  status: ReservationStatus
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/${reservationId}/status`,
    { method: "PUT", body: JSON.stringify({ status }) }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return reservation
}

/** Approve (→ confirmed) or decline (→ cancelled) a pending reservation. */
export async function decideReservation(
  venueId: string,
  reservationId: string,
  decision: "approved" | "declined"
): Promise<Reservation> {
  return setReservationStatus(
    venueId,
    reservationId,
    decision === "approved" ? "confirmed" : "cancelled"
  )
}

/** Check in an arrival (→ checked-in). */
export async function checkInReservation(
  venueId: string,
  reservationId: string
): Promise<Reservation> {
  return setReservationStatus(venueId, reservationId, "checked-in")
}

/** Cancel a reservation (→ cancelled), e.g. from the schedule event popover. */
export async function cancelReservation(
  venueId: string,
  reservationId: string
): Promise<Reservation> {
  return setReservationStatus(venueId, reservationId, "cancelled")
}

export interface RescheduleReservationInput {
  dayKey: string
  start: string
  durationMin: number
}

/** Move a reservation to a new day/time on its own court. */
export async function rescheduleReservation(
  venueId: string,
  reservationId: string,
  input: RescheduleReservationInput
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/${reservationId}`,
    { method: "PUT", body: JSON.stringify(input) }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return reservation
}

export interface CustomerInput {
  name: string
  phone: string
  favoriteSport: SportKey
}

/** Add a CRM customer to a venue (phone is the id; duplicates 409). */
export async function createCustomer(
  venueId: string,
  input: CustomerInput
): Promise<VenueCustomer> {
  const customer = await api<VenueCustomer>(
    `/api/venues/${venueId}/customers`,
    { method: "POST", body: JSON.stringify(input) }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return customer
}
