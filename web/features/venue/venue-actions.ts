"use server"

import { revalidatePath } from "next/cache"
import type {
  CourtBlock,
  CourtBlockReason,
  Reservation,
  ReservationStatus,
  SportKey,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueSeed,
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

// An account's brand may own many venue branches (chi nhánh), so every branch-
// scoped route carries the target `venueId` in the path (`/api/venues/:venueId/…`)
// and the API authorizes the caller owns it. The same id also targets
// `revalidatePath` at that branch's subtree so its bundle refetches after a write.

/**
 * Provision a venue branch from the guided setup wizard (the first branch also
 * mints the account's brand). Returns the new branch's id so the wizard can land
 * the operator directly on it — even when it's their second or third branch.
 */
export async function provisionVenue(input: VenueSetupInput): Promise<string> {
  const seed = await api<VenueSeed>("/api/venue/setup", {
    method: "POST",
    body: JSON.stringify(input),
  })
  revalidatePath("/dashboard", "layout")
  return seed.info.id
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

/**
 * Archive (soft-delete) a branch — VienTD-Review decision #11.
 * `DELETE /api/venues/:venueId` 409s with a Vietnamese message when the branch
 * still has a pending/confirmed booking in the future; callers should surface
 * that message and offer a link to the reservations screen rather than retry.
 */
export async function archiveVenue(id: string): Promise<void> {
  await api(`/api/venues/${id}`, { method: "DELETE" })
  revalidatePath(`/dashboard/venue/${id}`, "layout")
  revalidatePath("/dashboard", "layout")
}

/** Restore a previously archived branch (clears `archived`). */
export async function restoreVenue(id: string): Promise<Venue> {
  const venue = await api<Venue>(`/api/venues/${id}`, {
    method: "PUT",
    body: JSON.stringify({ archived: false }),
  })
  revalidatePath(`/dashboard/venue/${id}`, "layout")
  revalidatePath("/dashboard", "layout")
  return venue
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
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
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
  status: ReservationStatus,
  reason?: string
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/${reservationId}/status`,
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
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return customer
}

// ── Court blocks (VienTD-Review decision #12) ────────────────────────────────
// A block always carries a required `reason` — never inferred — and is
// guarded server-side against a live (pending/confirmed/checked-in) booking on
// the same court/slot.

export interface CourtBlockInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  reason: CourtBlockReason
  note?: string
}

export async function addCourtBlock(
  venueId: string,
  input: CourtBlockInput
): Promise<CourtBlock> {
  const block = await api<CourtBlock>(`/api/venues/${venueId}/blocks`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
  return block
}

/** Reopen a blocked slot ("Mở lại khung giờ"). */
export async function removeCourtBlock(
  venueId: string,
  blockId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/blocks/${blockId}`, { method: "DELETE" })
  revalidatePath(`/dashboard/venue/${venueId}`, "layout")
}
