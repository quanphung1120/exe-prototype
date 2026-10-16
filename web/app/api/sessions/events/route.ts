import { auth } from "@clerk/nextjs/server"

import { API_URL } from "@/lib/api"

// Same-origin bridge to the api's per-user session events
// (`GET /api/sessions/events`, server-sent events). The browser can't attach
// the Clerk bearer token to an `EventSource`, and the api lives on another
// origin — so this handler opens the upstream stream server-side with the
// signed-in user's token and pipes it through untouched. Fires a `session`
// event whenever the player's booking statuses change (approve/decline);
// the client refetches `GET /api/sessions` on receipt.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { userId, getToken } = await auth()
  const token = userId ? await getToken() : null
  if (!token) return new Response("Unauthorized", { status: 401 })

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/sessions/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal: request.signal,
    })
  } catch {
    return new Response("Session events unavailable", { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Session events unavailable", {
      status: upstream.status || 502,
    })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
