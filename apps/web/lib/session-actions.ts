"use server"

import type { PlaySession } from "@repo/shared"

import { API_URL, authHeaders } from "@/lib/api"

// Server actions that mirror a player's PlaySession changes to the Hono API so
// they persist to MongoDB (per Clerk user). The client SessionProvider owns the
// interactive `sessions` array and calls these on the terminal writes (confirm
// a booking, open a room, cancel) — fire-and-forget, so the UI stays snappy and
// optimistic. We deliberately do NOT revalidate the dashboard here: the client
// already holds the new state, and a refetch mid-interaction would fight it.
// The persisted copy is what a *cold* load (refresh/restart) reads back via the
// seed merge.

async function api(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(await authHeaders()),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
}

/** Persist (insert or replace) one of the signed-in user's sessions. */
export async function saveSession(session: PlaySession): Promise<void> {
  await api(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    body: JSON.stringify(session),
  })
}
