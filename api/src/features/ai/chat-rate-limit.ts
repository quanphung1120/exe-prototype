// ─── Per-user request rate limit for the AI chat endpoint ─────────────────
// `POST /api/ai/chat` is a paid-LLM endpoint (OpenRouter) called directly by
// the browser — Clerk auth alone does not bound how often a signed-in user
// can hit it. This is a small in-memory fixed-window limiter, keyed by Clerk
// userId, layered on top of the global per-IP ThrottlerGuard.
//
// PROTOTYPE LIMITATION: the window state lives in a module-scoped Map, so it
// is per-api-instance and resets on redeploy/restart. That's adequate for
// this prototype's single api instance (docker-compose / `pnpm dev`) but does
// NOT hold if the api ever runs with >1 replica (each instance gets its own
// memory) — at that point, swap this for a shared store (e.g. Redis/Upstash)
// behind the same `allowRequest` signature.

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10 // per user per minute

type Window = { start: number; count: number }
const windows = new Map<string, Window>()

// Cheap unbounded-growth guard: if the map ever grows past this many tracked
// users (e.g. long-running dev/staging instance, or abuse via many distinct
// accounts), sweep out windows that have already expired before inserting a
// new one. This is O(n) but only runs past the threshold, not per-request.
const MAX_TRACKED_USERS = 10_000

function sweepStale(now: number) {
  for (const [key, w] of windows) {
    if (now - w.start >= WINDOW_MS) windows.delete(key)
  }
}

/** True when this user still has quota in the current window. */
export function allowRequest(userId: string, now = Date.now()): boolean {
  if (windows.size > MAX_TRACKED_USERS) sweepStale(now)

  const w = windows.get(userId)
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(userId, { start: now, count: 1 })
    return true
  }
  if (w.count >= MAX_REQUESTS) return false
  w.count += 1
  return true
}
