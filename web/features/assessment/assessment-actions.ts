"use server"

import type { PlayerAssessment } from "@/lib/shared"

import { API_URL, authHeaders } from "@/lib/api"

// Server action mirroring a player's completed skills assessment to the Hono API
// so it persists to MongoDB (per Clerk user). The wizard writes to localStorage
// (the instant client cache the many synchronous readers use) and also calls
// this — fire-and-forget, like session-actions — so the assessment survives a
// device/browser switch. We deliberately do NOT revalidate: the client already
// holds the value; the persisted copy is what a cold load reads back via the
// seed merge.

/** Persist (insert or replace) the signed-in user's skills assessment. */
export async function saveAssessment(
  assessment: PlayerAssessment
): Promise<void> {
  const res = await fetch(`${API_URL}/api/assessment`, {
    method: "PUT",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(assessment),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
}
