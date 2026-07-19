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
