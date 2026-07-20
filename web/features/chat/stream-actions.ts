"use server"

import { apiFetch } from "@/lib/api"
import { roomChannelId } from "@/features/chat/channel-ids"

// ── Real room-chat lifecycle (quyết định #13) ────────────────────────────
// Only the room's real members are ever added — no mock seeding — every
// mutation authorized against the channel's `created_by` (the host) on the
// api side. Failures here are always best-effort from the caller's side — a
// chat hiccup must never block a matchmaking/booking decision. The old
// `ensureRoomChannel` (`POST /api/stream/channels`, mock-seeded invitees) was
// removed in Phase 9 — a room's chat is created host-only by `createRoomChat`
// the moment the room exists; real members are added/removed by the api
// itself as part of deciding a join request or a member leaving (Phase 9 G2,
// `api/src/features/rooms/`), not by the web calling these directly for that
// flow anymore.

/** Create a room's real chat with only the host as a member — never mocks. */
export async function createRoomChat(input: {
  roomId: string
  name: string
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/stream/rooms", {
    method: "POST",
    body: { id: roomChannelId(input.roomId), name: input.name },
  })
}

/** Host adds a real (non-mock) member to their room's chat — e.g. on approve. */
export async function addRoomMember(input: {
  roomId: string
  memberId: string
}): Promise<void> {
  await apiFetch("/api/stream/rooms/members", {
    method: "POST",
    body: { channelId: roomChannelId(input.roomId), memberId: input.memberId },
  })
}

/** Remove a member — host kick/decline, or a member leaving themselves. */
export async function removeRoomMember(input: {
  roomId: string
  memberId: string
}): Promise<void> {
  await apiFetch("/api/stream/rooms/members", {
    method: "DELETE",
    body: { channelId: roomChannelId(input.roomId), memberId: input.memberId },
  })
}

/** Host freezes their room's chat on cancel — keeps history, blocks sends. */
export async function freezeRoomChat(roomId: string): Promise<void> {
  await apiFetch("/api/stream/rooms/freeze", {
    method: "POST",
    body: { channelId: roomChannelId(roomId) },
  })
}
