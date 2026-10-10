"use server"

import type { DueRoomShare, RoomSharesInfo } from "@/lib/shared"

import { apiFetch } from "@/lib/api"

// Server actions for splitting a booked room's court price between its
// members — thin wrappers over `GET /api/rooms/shares/due`,
// `GET /api/rooms/:id/shares` and `POST /api/rooms/:id/share`. Result objects
// instead of throws, like `rooms-actions.ts`, so the caller can branch on the
// status (402 = wallet balance too low) and show the API's Vietnamese message.

export type RoomShareActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

async function shareApi<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<RoomShareActionResult<T>> {
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

/** The caller's unpaid shares in rooms whose court the host has paid for. */
export async function getDueShares(): Promise<
  RoomShareActionResult<DueRoomShare[]>
> {
  return shareApi<DueRoomShare[]>("/api/rooms/shares/due")
}

/** Who in a room has paid their part of the court. */
export async function getRoomShares(
  roomId: string
): Promise<RoomShareActionResult<RoomSharesInfo>> {
  return shareApi<RoomSharesInfo>(
    `/api/rooms/${encodeURIComponent(roomId)}/shares`
  )
}

/** Pay the caller's seat share into the host's wallet. 402 = balance too low. */
export async function payRoomShare(
  roomId: string
): Promise<RoomShareActionResult<{ ok: true }>> {
  return shareApi<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/share`,
    { method: "POST" }
  )
}

/** The host's answer to a paid member's request to leave (approve = refund). 402 = host wallet too low. */
export async function decideLeaveRequest(
  roomId: string,
  memberId: string,
  decision: "approve" | "decline"
): Promise<RoomShareActionResult<{ ok: true }>> {
  return shareApi<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/leave-requests/${encodeURIComponent(memberId)}`,
    { method: "PUT", body: { decision } }
  )
}

/** A member complains to the platform about a refused/ignored leave request. */
export async function fileRoomComplaint(
  roomId: string,
  reason: string
): Promise<RoomShareActionResult<{ ok: true }>> {
  return shareApi<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/complaints`,
    { method: "POST", body: { reason: reason.trim() } }
  )
}
