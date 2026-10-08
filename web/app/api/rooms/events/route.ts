import { auth } from "@clerk/nextjs/server"

import { API_URL } from "@/lib/api"

// Same-origin bridge to the api's live room events (`GET /api/rooms/events`,
// server-sent events). The browser can't attach the Clerk bearer token to an
// `EventSource`, and the api lives on another origin — so this handler opens
// the upstream stream server-side with the signed-in user's token and pipes
// it through untouched. The token is only checked when the stream opens;
// `EventSource` reconnects on its own (with a fresh token) if it drops.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { userId, getToken } = await auth()
  const token = userId ? await getToken() : null
  if (!token) return new Response("Unauthorized", { status: 401 })

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/rooms/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      // Closing the tab closes the upstream connection too.
      signal: request.signal,
    })
  } catch {
    return new Response("Room events unavailable", { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Room events unavailable", {
      status: upstream.status || 502,
    })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Don't let a reverse proxy buffer the stream.
      "X-Accel-Buffering": "no",
    },
  })
}
