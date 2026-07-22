"use server"

import { revalidatePath } from "next/cache"

import { apiAction as api } from "@/lib/api"
import type {
  AdminBookingRow,
  AdminApprovalRow,
} from "@/features/admin/admin-types"

// Server actions for the admin workspace. They run on the server (so the api
// base stays off the client) and call the role-gated `/api/admin/*` routes,
// then revalidate the admin subtree so the next render refetches fresh data.
// apiAction (lib/api.ts) carries the shared base URL, timeout and Clerk bearer
// token, and unwraps a non-2xx response into a plain `Error`, so writes hit
// the same host/port and auth as reads and callers can just `catch` a message.

function revalidateAdmin() {
  revalidatePath("/dashboard/admin", "layout")
}

export async function approveVenue(venueId: string): Promise<void> {
  await api(`/api/admin/venues/${venueId}/approve`, { method: "POST" })
  revalidateAdmin()
}

export async function rejectVenue(
  venueId: string,
  reason: string
): Promise<AdminApprovalRow> {
  const venue = await api<AdminApprovalRow>(
    `/api/admin/venues/${venueId}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) }
  )
  revalidateAdmin()
  return venue
}

export async function suspendVenue(venueId: string): Promise<void> {
  await api(`/api/admin/venues/${venueId}/suspend`, { method: "POST" })
  revalidateAdmin()
}

export async function restoreVenue(venueId: string): Promise<void> {
  await api(`/api/admin/venues/${venueId}/restore`, { method: "POST" })
  revalidateAdmin()
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
