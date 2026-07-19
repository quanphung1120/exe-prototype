"use server"

import type { BookingRecord } from "@/lib/shared"

import { apiFetch } from "@/lib/api"

// Server actions for the player-facing bookings API (Phase 3, VienTD-Review
// decision #8) — the narrow POST /api/bookings/* routes layered on top of the
// canonical `bookings` collection. `session.tsx`'s `confirmBooking` awaits
// `createBookingHold` at the moment a court+slot is actually reserved (the
// server computes the 20-minute hold expiry now, replacing the old
// client-only HOLD_MS timer / PUT-triggered cross-write), and `cancelBooking`
// awaits `cancelBookingRecord` so the refund policy (≥24h/<24h/after-start)
// runs server-side instead of being simulated locally.
//
// These return a result object instead of throwing: a thrown Error crossing
// the Server Action boundary back to the client loses its subclass/custom
// fields (Next redacts/reconstructs it), so a caller couldn't reliably branch
// on the HTTP status (e.g. 409) from a caught exception. Returning
// `{ ok: false, status, message }` is plain serializable data — it survives
// the boundary intact.

/** Everything a player/venue caller needs back from a booking mutation. */
export type BookingSummary = Pick<
  BookingRecord,
  | "bookingId"
  | "venueId"
  | "courtId"
  | "courtName"
  | "sport"
  | "source"
  | "userId"
  | "sessionId"
  | "startAt"
  | "endAt"
  | "dateKey"
  | "start"
  | "durationMin"
  | "price"
  | "status"
  | "paymentStatus"
  | "holdExpiresAt"
  | "confirmDeadlineAt"
  | "checkedInAt"
  | "declineReason"
  | "cancelReason"
  | "refund"
>

export interface CreateBookingHoldInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  /** The forming PlaySession this hold belongs to, if booked from a room. */
  sessionId?: string
}

/** The outcome of a booking-API call — `status` lets the caller branch on a 409. */
export type BookingActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

// The API's AllExceptionsFilter maps every failure to `{ error: message }`
// (see CLAUDE.md § API); better-fetch (`throw: true`) surfaces that parsed
// body as `BetterFetchError.error`, alongside `.status`. Unwrap both into the
// plain result shape above.
async function bookingsApi<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<BookingActionResult<T>> {
  try {
    const data = await apiFetch<T>(path, init)
    return { ok: true, data }
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number(err.status)
        : 500
    const message =
      err && typeof err === "object" && "error" in err
        ? ((err as { error?: { error?: string } }).error?.error ?? undefined)
        : undefined
    return { ok: false, status, message: message ?? "Request failed" }
  }
}

/**
 * Create a fresh unpaid `awaiting_payment` hold — `POST /api/bookings` — for
 * the signed-in player. Validates opening hours, the per-court overlap and
 * the caller's own cross-venue self-overlap server-side; a slot taken in the
 * meantime (or double-booked against the caller's own other holds) comes back
 * as `{ ok: false, status: 409 }`.
 */
export async function createBookingHold(
  input: CreateBookingHoldInput
): Promise<BookingActionResult<BookingSummary>> {
  return bookingsApi<BookingSummary>("/api/bookings", {
    method: "POST",
    body: input,
  })
}

/**
 * Cancel the caller's own booking — `POST /api/bookings/:id/cancel` —
 * refunded per the ≥24h/<24h/after-start policy (server-computed).
 */
export async function cancelBookingRecord(
  bookingId: string,
  reason?: string
): Promise<BookingActionResult<BookingSummary>> {
  return bookingsApi<BookingSummary>(
    `/api/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { method: "POST", body: reason ? { reason } : {} }
  )
}
