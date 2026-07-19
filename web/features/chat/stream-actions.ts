"use server"

import { apiFetch } from "@/lib/api"
import { roomChannelId } from "@/features/chat/channel-ids"

// Server action for lazily creating a match-room / team Stream channel. Runs on
// the server (keeps the API base + Clerk bearer off the client) and calls the
// api's get-or-create endpoint. Idempotent: re-opening a room chat returns the
// existing channel without overwriting it.
export async function ensureRoomChannel(input: {
  roomId: string
  name: string
  memberInitials: string[]
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/stream/channels", {
    method: "POST",
    body: {
      id: roomChannelId(input.roomId),
      name: input.name,
      memberInitials: input.memberInitials,
    },
  })
}

// ── Real room-chat lifecycle (quyết định #13) ────────────────────────────
// Distinct from `ensureRoomChannel` above: no mock seeding, only the room's
// real members ever added, every mutation authorized against the channel's
// `created_by` (the host) on the api side. Failures here are always
// best-effort from the caller's side — a chat hiccup must never block a
// matchmaking/booking decision.

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
