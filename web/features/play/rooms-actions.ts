"use server"

import type { LeaveRoomResult, PlaySession } from "@/lib/shared"

import { apiFetch } from "@/lib/api"

// Server actions for the cross-user room-coordination API (Phase 9 G2,
// VienTD-Review decision #16 — `api/src/features/rooms/`). Distinct from the
// per-owner `sessions` collection (`session-actions.ts`): `GET /api/rooms`
// browses every *other* signed-in user's listed room too, and the mutations
// below target another user's document directly — the requester's join
// request, the host's approve/decline, a member leaving on their own.
//
// Like `booking-actions.ts`, these return a result object instead of
// throwing: a thrown Error crossing the Server Action boundary back to the
// client loses its subclass/custom fields (Next redacts/reconstructs it), so
// a caller couldn't reliably branch on the HTTP status (e.g. a 409 — room
// full/closed, request already decided) from a caught exception. Returning
// `{ ok: false, status, message }` is plain serializable data that survives
// the boundary intact — `message` is the API's own (Vietnamese)
// `AllExceptionsFilter` text, safe to surface directly in a toast.

export type RoomActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

async function roomsApi<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<RoomActionResult<T>> {
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
 * Every listed, non-demo, still-open room across every signed-in user —
 * `SessionProvider` polls this (mirroring `NotificationsProvider`'s poll) as
 * the source of truth for which rooms the caller has joined outside their own
 * session doc, and to browse rooms other players host.
 */
export async function listRooms(): Promise<PlaySession[]> {
  return apiFetch<PlaySession[]>("/api/rooms")
}

/** Ask to join someone else's room — takes a `requested` seat pending the host. */
export async function requestJoinRoom(
  roomId: string
): Promise<RoomActionResult<void>> {
  return roomsApi<void>(`/api/rooms/${encodeURIComponent(roomId)}/requests`, {
    method: "POST",
  })
}

/** The room host's decision on a pending join request. */
export async function decideRoomRequest(
  roomId: string,
  targetUserId: string,
  decision: "approve" | "decline"
): Promise<RoomActionResult<void>> {
  return roomsApi<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/requests/${encodeURIComponent(targetUserId)}`,
    { method: "PUT", body: { decision } }
  )
}

/** The host cancels their room — removed for everyone, members notified. */
export async function disbandRoom(
  roomId: string
): Promise<RoomActionResult<void>> {
  return roomsApi<void>(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  })
}

/**
 * A confirmed (non-host) member leaves someone else's room. Free unless they've
 * paid toward the court: then it only files a request (`status: "requested"`)
 * the host must approve, and they stay in the room meanwhile.
 */
export async function leaveRoomMembership(
  roomId: string
): Promise<RoomActionResult<LeaveRoomResult>> {
  return roomsApi<LeaveRoomResult>(
    `/api/rooms/${encodeURIComponent(roomId)}/members/me`,
    {
      method: "DELETE",
    }
  )
}
