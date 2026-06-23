import "server-only"

import { headers } from "next/headers"

import { API_URL } from "./api"

// The Better Auth user as returned by /api/auth/get-session. Kept minimal — the
// auth server lives in apps/api, so we can't infer its types here.
export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

export type ServerSession = {
  user: AuthUser
  session: { id: string; expiresAt: string; userId: string }
}

/**
 * Read the current auth session server-side. Auth runs on the Hono API, so we
 * forward the incoming request's cookies to its `get-session` endpoint. The
 * session cookie is host-only on `localhost`, so it reaches both the web
 * (:3000) and the API (:6969) and validates here.
 *
 * Returns `null` when there is no valid session.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookie = (await headers()).get("cookie") ?? ""
  if (!cookie) return null

  // A rejected fetch (API down/unreachable) must not crash every dashboard
  // route with a 500 — treat it as "no session" so the guard bounces to sign-in.
  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    })

    if (!res.ok) return null

    const data = (await res.json()) as ServerSession | null
    return data?.user ? data : null
  } catch {
    return null
  }
}
