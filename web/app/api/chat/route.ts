import { auth } from "@clerk/nextjs/server"

import { API_URL } from "@/lib/api"
import { allowRequest } from "./rate-limit"

// Thin auth-forwarding streaming proxy. The AI logic (model, prompt, tools)
// lives in the api at POST /api/ai/chat; this route forwards the browser's
// request there with the caller's Clerk Bearer token and streams the
// UI-message-stream response straight back. The per-user rate limit stays here
// because every chat request funnels through this proxy.
export async function POST(req: Request) {
  const { userId, getToken } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  if (!allowRequest(userId)) {
    return new Response("Too many requests — thử lại sau một phút nhé.", {
      status: 429,
      headers: { "Retry-After": "60" },
    })
  }

  // Cheap edge DoS guard: reject oversized bodies before forwarding.
  const body = await req.text()
  if (body.length > 64_000) {
    return new Response("Request body too large", { status: 413 })
  }

  const token = await getToken()
  const upstream = await fetch(`${API_URL}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body,
  })

  // Stream the upstream body straight through, preserving the api's status and
  // the AI SDK's UI-message-stream headers (content-type, x-vercel-ai-*).
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}
