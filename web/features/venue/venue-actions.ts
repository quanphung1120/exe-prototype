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

import { apiFetch } from "@/lib/api"

// Server actions for venue management. They run on the server (so the Hono API
// base stays off the client) and call the API's CRUD routes, then revalidate
// the relevant venue path so the server-rendered seed refetches.
// apiFetch (lib/api.ts) carries the shared base URL, timeout and Clerk bearer
// token, so writes hit the same host/port and auth as reads.

// The API's onError maps every AppError to `{ error: message }` (see
// CLAUDE.md § API auth); better-fetch surfaces that parsed body as
// `BetterFetchError.error`, so unwrap it one level to get the message string.
async function api<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<T> {
  try {
    return await apiFetch<T>(path, init)
  } catch (err) {
    const message =
      err && typeof err === "object" && "error" in err
        ? ((err as { error?: { error?: string } }).error?.error ?? undefined)
        : undefined
    throw new Error(message ?? "Request failed")
  }
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

export interface VenueSetupInput extends VenueInput {
  courts: CourtInput[]
}

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

// Each account owns exactly one venue, resolved server-side from the caller's
// Clerk id — so these routes carry no venue id in the path. The `venueId` args
// (the caller's own venue) are kept only to target `revalidatePath` at the
// venue subtree so the server-rendered bundle refetches after a write.

/** Provision the account's single venue from the guided setup wizard. */
export async function provisionVenue(input: VenueSetupInput): Promise<void> {
  await api("/api/venue/setup", {
    method: "POST",
    body: JSON.stringify(input),
  })
  revalidatePath("/dashboard", "layout")
}

export async function updateVenue(
  id: string,
  input: Partial<VenueInput>
): Promise<Venue> {
  const venue = await api<Venue>("/api/venues", {
    method: "PUT",
    body: JSON.stringify(input),
  })
  revalidatePath(`/dashboard/venue/${id}`, "layout")
  revalidatePath("/dashboard", "layout")
  return venue
}

export async function addCourt(
  venueId: string,
  input: CourtInput
): Promise<VenueCourt> {
  const court = await api<VenueCourt>("/api/venues/courts", {
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
  const court = await api<VenueCourt>(`/api/venues/courts/${courtId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return court
}

export async function deleteCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await api(`/api/venues/courts/${courtId}`, { method: "DELETE" })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
}

export async function addWalkInReservation(
  venueId: string,
  input: WalkInReservationInput
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    "/api/venues/reservations/walk-in",
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
  status: ReservationStatus,
  reason?: string
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/reservations/${reservationId}/status`,
    { method: "PUT", body: JSON.stringify({ status, reason }) }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return reservation
}

/**
 * Approve (→ confirmed) or decline (→ cancelled) a pending reservation. A
 * decline requires a reason, which flows back to the linked player's session
 * (cancelled + reason + refund) via the API.
 */
export async function decideReservation(
  venueId: string,
  reservationId: string,
  decision: "approved" | "declined",
  reason?: string
): Promise<Reservation> {
  return setReservationStatus(
    venueId,
    reservationId,
    decision === "approved" ? "confirmed" : "cancelled",
    decision === "declined" ? reason : undefined
  )
}

/** Check in an arrival (→ checked-in). */
export async function checkInReservation(
  venueId: string,
  reservationId: string
): Promise<Reservation> {
  return setReservationStatus(venueId, reservationId, "checked-in")
}

/**
 * Cancel a reservation (→ cancelled), e.g. from the schedule event popover.
 * The API requires a reason for any cancellation; it flows back to the
 * player as a refund notification.
 */
export async function cancelReservation(
  venueId: string,
  reservationId: string,
  reason: string
): Promise<Reservation> {
  return setReservationStatus(venueId, reservationId, "cancelled", reason)
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
    `/api/venues/reservations/${reservationId}`,
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
  const customer = await api<VenueCustomer>("/api/venues/customers", {
    method: "POST",
    body: JSON.stringify(input),
  })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return customer
}
