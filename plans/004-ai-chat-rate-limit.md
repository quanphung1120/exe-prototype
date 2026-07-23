# Plan 004: Rate-limit and size-cap the AI chat route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- web/app/api/chat/`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (cost abuse / DoS)
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

`POST /api/chat` (`web/app/api/chat/route.ts`) is a paid-LLM proxy
(OpenRouter). It authenticates via Clerk but has **no per-user rate limit and
no per-message size cap**: any signed-in user can fire unlimited concurrent
requests, each carrying up to 50 messages of unbounded length and running up
to 5 model steps. That is direct, unbounded billing exposure and can exhaust
the provider quota (feature-wide DoS). The NestJS ThrottlerGuard protects the
api app only — this Next.js route is unguarded.

## Current state

- `web/app/api/chat/route.ts` — the only file. Key excerpts:

```ts
// :58-65 — body schema: array capped at 50, items unvalidated/unbounded
const bodySchema = z.object({
  messages: z.array(z.unknown()).max(50),
  userLevels: sportLevelsSchema,
  userLocation: latLngSchema,
  locale: z.enum(["en", "vi"]).optional(),
})

// :212-216 — auth, no rate limiting
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }
```

and later `streamText({ model: openrouter(MODEL, ...), stopWhen:
[stepCountIs(5), ...] })`.

- Deployment reality: this is a prototype run as a **single Next.js instance**
  (docker-compose / `pnpm dev`). There is no Redis/Upstash in the stack — an
  in-memory limiter is the right scope here; do NOT add an external service.
- Conventions: Prettier no-semicolons/double-quotes; `@/*` import alias;
  comments in this file are thorough English — match that register.

## Commands you will need

| Purpose | Command (inside `web/`) | Expected |
|---------|--------------------------|----------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `web/app/api/chat/route.ts`
- `web/app/api/chat/rate-limit.ts` (create)

**Out of scope**:
- The api app's ThrottlerGuard — different app, already configured.
- The chat UI (`web/features/chat/**`) — a 429 streams back as an error the
  existing UI error path already renders; no client change.
- Adding Redis/Upstash or any external dependency.

## Git workflow

- Branch: `advisor/004-chat-rate-limit`
- One commit, e.g. `Rate-limit and size-cap the AI chat route`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `web/app/api/chat/rate-limit.ts`

A small in-memory fixed-window limiter, module-scoped Map keyed by userId
(comment prominently that it is per-instance and resets on redeploy — adequate
for the single-instance prototype, to be replaced by a shared store if the app
scales horizontally):

```ts
const WINDOW_MS = 60_000
const MAX_REQUESTS = 10 // per user per minute

type Window = { start: number; count: number }
const windows = new Map<string, Window>()

/** True when this user still has quota in the current window. */
export function allowRequest(userId: string, now = Date.now()): boolean {
  const w = windows.get(userId)
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(userId, { start: now, count: 1 })
    return true
  }
  if (w.count >= MAX_REQUESTS) return false
  w.count += 1
  return true
}
```

Add a periodic sweep or lazy cleanup (e.g. delete stale entries when the map
exceeds ~10k keys) so the map can't grow unbounded.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Enforce it in the route

In `route.ts`, immediately after the `userId` check:

```ts
if (!allowRequest(userId)) {
  return new Response("Too many requests — thử lại sau một phút nhé.", {
    status: 429,
    headers: { "Retry-After": "60" },
  })
}
```

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 3: Cap request size

Two layers, both in `route.ts`:

1. Before `req.json()`: reject bodies over 64 KB —
   `const text = await req.text()`; if `text.length > 64_000` return 413;
   else `JSON.parse(text)` inside the existing try/catch (replacing
   `req.json()`).
2. In `bodySchema`, bound each message: replace `z.array(z.unknown()).max(50)`
   with `z.array(z.unknown()).max(50)` **plus** a `.superRefine` (or a
   `.refine`) asserting `JSON.stringify(messages).length <= 48_000` — keep the
   existing comment explaining messages are structurally validated downstream
   by the AI SDK converter, and extend it to mention the size bound.

(The route already caps model work via `stepCountIs(5)` — leave that.)

**Verify**: `pnpm typecheck && pnpm lint && pnpm build` → all exit 0.

### Step 4: Manual smoke (if dev env available)

With `pnpm dev` and a signed-in session, send 11 rapid chat messages — the
11th should surface an error toast/state in the chat UI and the server should
have returned 429. If no dev env, note it skipped.

## Test plan

`web` has no test runner yet (plan 008). The limiter is written as a pure
module precisely so plan 008 can add unit tests
(`allowRequest` with injected `now`: window rollover, cap at MAX_REQUESTS,
per-user isolation). Note this as a follow-up in your report if plan 008 is
not yet done.

## Done criteria

- [ ] `web/app/api/chat/rate-limit.ts` exists; `allowRequest` takes an injectable `now`
- [ ] Route returns 429 + `Retry-After` when over per-user quota, 413 on >64 KB bodies
- [ ] `bodySchema` bounds total message payload size
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build` all exit 0
- [ ] `git status` shows only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The route file no longer matches the excerpts (drifted).
- The chat UI hard-crashes (not just an error state) on a 429/413 response in
  the Step 4 smoke — the client error path would need work first (report,
  don't fix `features/chat` yourself).
- You find an existing rate-limit mechanism already covering this route
  (middleware or platform-level) — report before adding a second one.

## Maintenance notes

- The in-memory limiter is per-instance: if the web app ever runs with >1
  replica or on serverless (per-invocation memory), replace with a shared
  store (Redis/Upstash) — the `allowRequest` seam is the swap point.
- Reviewer: check the 429 copy is user-appropriate (Vietnamese-first product)
  and that the size caps don't reject legitimate long conversations (50 msgs ×
  ~1 KB average fits comfortably under 48 KB).
- Tune `MAX_REQUESTS` with real usage data; 10/min is a conservative start.
