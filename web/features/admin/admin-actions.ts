"use server"

import { revalidatePath } from "next/cache"

import { apiAction as api } from "@/lib/api"
import type { RoomComplaintRow, WithdrawalRow } from "@/lib/shared"
import type {
  AdminBookingRow,
  AdminDiscountInput,
  AdminDiscountRow,
} from "@/features/admin/admin-types"

// Server actions for the admin workspace. They run on the server (so the api
// base stays off the client) and call the role-gated `/api/admin/*` routes,
// then revalidate the admin subtree so the next render refetches fresh data.
// apiAction (lib/api.ts) carries the shared base URL, timeout and Clerk bearer
// token, and unwraps a non-2xx response into a plain `Error`, so writes hit
// the same host/port and auth as reads and callers can just `catch` a message.

function revalidateAdmin() {
  revalidatePath("/app/admin", "layout")
}

export async function approveBrand(brandId: string): Promise<void> {
  await api(`/api/admin/brands/${brandId}/approve`, { method: "POST" })
  revalidateAdmin()
}

export async function rejectBrand(
  brandId: string,
  reason: string
): Promise<void> {
  await api(`/api/admin/brands/${brandId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
  revalidateAdmin()
}

/**
 * Result-object shape for the venue actions whose failure message matters to
 * the admin (e.g. "còn lượt đặt tương lai"): Next redacts the message of an
 * error thrown out of a server action in production, a returned object isn't.
 */
export type AdminActionResult = { ok: true } | { ok: false; message: string }

async function toResult(
  run: () => Promise<unknown>
): Promise<AdminActionResult> {
  try {
    await run()
    revalidateAdmin()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Request failed",
    }
  }
}

export async function suspendVenue(
  venueId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/venues/${venueId}/suspend`, { method: "POST" })
  )
}

export async function restoreVenue(
  venueId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/venues/${venueId}/restore`, { method: "POST" })
  )
}

/** Delete a venue owner's account with all their brands, venues and data. */
export async function removeVenueOwner(
  ownerId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/owners/${encodeURIComponent(ownerId)}`, {
      method: "DELETE",
    })
  )
}

export async function settleRefund(
  bookingId: string,
  ref: string
): Promise<void> {
  await api(`/api/admin/refunds/${bookingId}/settle`, {
    method: "POST",
    body: JSON.stringify({ ref }),
  })
  revalidateAdmin()
}

export async function forceCancelBooking(
  bookingId: string,
  reason: string
): Promise<AdminBookingRow> {
  const booking = await api<AdminBookingRow>(
    `/api/admin/bookings/${bookingId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason }) }
  )
  revalidateAdmin()
  return booking
}

export async function createDiscount(
  input: AdminDiscountInput
): Promise<AdminDiscountRow> {
  const discount = await api<AdminDiscountRow>("/api/admin/discounts", {
    method: "POST",
    body: JSON.stringify(input),
  })
  revalidateAdmin()
  return discount
}

export async function updateDiscount(
  code: string,
  patch: Partial<AdminDiscountInput>
): Promise<AdminDiscountRow> {
  const discount = await api<AdminDiscountRow>(`/api/admin/discounts/${code}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  revalidateAdmin()
  return discount
}

export async function deleteDiscount(code: string): Promise<void> {
  await api(`/api/admin/discounts/${code}`, { method: "DELETE" })
  revalidateAdmin()
}

/**
 * Hide or re-show a user's app review. Also revalidates the landing page,
 * whose testimonials quote these reviews.
 */
export async function setAppReviewHidden(
  userId: string,
  hidden: boolean
): Promise<void> {
  const action = hidden ? "hide" : "show"
  await api(`/api/admin/app-reviews/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
  })
  revalidateAdmin()
  revalidatePath("/[locale]", "page")
}

/** Settle a room-share complaint: refund the member's share or dismiss it. */
export async function resolveComplaint(
  id: string,
  decision: "refund" | "dismiss",
  note: string
): Promise<RoomComplaintRow> {
  const row = await api<RoomComplaintRow>(
    `/api/admin/complaints/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    }
  )
  revalidateAdmin()
  return row
}

/** Record that a wallet withdrawal's bank transfer was sent. */
export async function completeWithdrawal(
  id: string,
  ref: string
): Promise<WithdrawalRow> {
  const row = await api<WithdrawalRow>(
    `/api/admin/withdrawals/${encodeURIComponent(id)}/complete`,
    { method: "POST", body: JSON.stringify({ ref: ref.trim() }) }
  )
  revalidateAdmin()
  return row
}

/** Refuse a withdrawal; the money goes back into the player's wallet. */
export async function rejectWithdrawal(
  id: string,
  note: string
): Promise<WithdrawalRow> {
  const row = await api<WithdrawalRow>(
    `/api/admin/withdrawals/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ note: note.trim() }) }
  )
  revalidateAdmin()
  return row
}
