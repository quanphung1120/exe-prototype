"use server"

import type { GroupMatchResult, RatingSummary } from "@/lib/shared"
import { apiAction } from "@/lib/api"

// Group-chat management (rename, members, the match a group coordinates) and
// peer ratings after a played match. `apiAction` unwraps the api's
// `{ error }` body into an `Error` message, so callers can toast it as-is.

/** The match a group chat is coordinating + whether the caller may book it. */
export async function getGroupMatch(
  channelId: string
): Promise<GroupMatchResult> {
  return apiAction<GroupMatchResult>(
    `/api/rooms/by-channel/${encodeURIComponent(channelId)}`
  )
}

/** Rename a group chat — any member may. */
export async function renameGroup(
  channelId: string,
  name: string
): Promise<void> {
  await apiAction("/api/stream/groups/name", {
    method: "PATCH",
    body: { channelId, name },
  })
}

/** Group creator adds real users to their community group. */
export async function addGroupMembers(
  channelId: string,
  memberIds: string[]
): Promise<void> {
  await apiAction("/api/stream/groups/members", {
    method: "POST",
    body: { channelId, memberIds },
  })
}

/** Group creator / room host removes a member from the chat. */
export async function removeGroupMember(
  channelId: string,
  memberId: string
): Promise<void> {
  await apiAction("/api/stream/rooms/members", {
    method: "DELETE",
    body: { channelId, memberId },
  })
}

/** Rate a fellow player of a finished match (once per player per match). */
export async function ratePlayer(input: {
  sessionId: string
  rateeId: string
  stars: number
  comment?: string
}): Promise<void> {
  await apiAction("/api/ratings", { method: "POST", body: input })
}

/** Who the caller already rated in a match. */
export async function myMatchRatings(
  sessionId: string
): Promise<{ rateeId: string; stars: number }[]> {
  return apiAction(
    `/api/ratings/sessions/${encodeURIComponent(sessionId)}/mine`
  )
}

/** A player's rating summary for their profile. */
export async function playerRatingSummary(
  userId: string
): Promise<RatingSummary> {
  return apiAction<RatingSummary>(
    `/api/ratings/users/${encodeURIComponent(userId)}/summary`
  )
}
