# Plan 010: Make the AI chat call the NestJS api directly from the browser (delete the web proxy route)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 7376f86..HEAD -- web/app/api/chat web/features/chat/ai-native-dashboard.tsx web/proxy.ts web/lib/api.ts api/src/features/ai docker-compose.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (changes a user-facing streaming flow and its auth path; fully reversible)
- **Depends on**: plans/009-move-ai-chat-to-backend.md (DONE — merged at `7376f86`)
- **Category**: tech-debt
- **Planned at**: commit `7376f86`, 2026-07-23

## Why this matters

Plan 009 moved the AI chat's LLM logic (model, prompt, tools) into the NestJS
api at `POST /api/ai/chat`, but left the browser talking to a Next.js route
handler (`web/app/api/chat/route.ts`) that only re-authenticates and pipes the
stream through. That proxy is now pure overhead: every token streams through
two servers, the web server holds one open connection per active chat for the
whole stream duration, and the per-user rate limiter lives in the wrong app
(the web tier) guarding a resource owned by the api. This plan has the browser
call the api directly with the caller's Clerk Bearer token (the api's
`ClerkAuthGuard` + CORS already support exactly this), moves the per-user rate
limiter into the api's `ai` feature, and deletes the proxy — after which the
web app has zero Next.js API routes and the api is the single enforcement
point for auth, validation, and rate limiting on the chat.

## Current state

### The flow today

Browser (`useChat()`, default transport) → `POST /api/chat` on the Next.js
origin → `web/app/api/chat/route.ts` re-auths via Clerk, rate-limits per user,
caps body at 64 KB, then forwards to `${API_URL}/api/ai/chat` with a Bearer
token and pipes the stream back.

### Relevant files

- `web/app/api/chat/route.ts` — the proxy to delete. Auths, rate-limits, forwards:

  ```ts
  // web/app/api/chat/route.ts:11-36 (abridged)
  export async function POST(req: Request) {
    const { userId, getToken } = await auth()
    if (!userId) return new Response("Unauthorized", { status: 401 })
    if (!allowRequest(userId)) {
      return new Response("Too many requests — thử lại sau một phút nhé.", {
        status: 429,
        headers: { "Retry-After": "60" },
      })
    }
    const body = await req.text()
    if (body.length > 64_000) { /* 413 */ }
    const token = await getToken()
    const upstream = await fetch(`${API_URL}/api/ai/chat`, { /* Bearer forward */ })
    return new Response(upstream.body, { /* pass-through */ })
  }
  ```

- `web/app/api/chat/rate-limit.ts` — pure fixed-window per-user limiter
  (`WINDOW_MS = 60_000`, `MAX_REQUESTS = 10`, `MAX_TRACKED_USERS = 10_000`
  sweep guard). Exports `allowRequest(userId: string, now = Date.now()): boolean`.
  No imports, no env access. This module moves to the api verbatim (comments
  updated).
- `web/app/api/chat/rate-limit.test.ts` — vitest tests for `allowRequest`
  (cap at 10, 11th rejected, window rollover at exactly 60_000 ms, per-user
  isolation, injectable `now`). These get ported to the api's node:test runner.
- `web/features/chat/ai-native-dashboard.tsx` — the only `useChat` consumer.
  Today (line 256):

  ```tsx
  // AI SDK v6 — sendMessage replaces handleSubmit/append
  const { messages, sendMessage, status, setMessages } = useChat()
  ```

  and it sends per-request extras (line 411-414):

  ```tsx
  void sendMessage(
    { text: trimmed },
    { body: { userLevels: activeUserLevels, userLocation, locale } }
  )
  ```

- `web/proxy.ts` — Next.js 16 middleware (the `middleware.ts` convention was
  renamed to `proxy.ts`). Contains a `/api/chat`-specific matcher entry and an
  early-return branch that both become dead once the route is deleted:

  ```ts
  // web/proxy.ts:14-19
  export default clerkMiddleware((_auth, req) => {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next()
    }
    return handleIntl(req)
  })
  // web/proxy.ts:21-29
  export const config = {
    matcher: [
      "/((?!api|_next|_vercel|.*\\..*).*)",
      // Run Clerk on the chat API endpoint specifically to enable authentication
      "/api/chat",
    ],
  }
  ```

- `web/lib/api.ts` — server-only (`import "server-only"`). Exports
  `API_URL = process.env.API_URL ?? "http://localhost:6969"`. Its
  `sharedFetchConfig` JSDoc lists `/api/chat` among Clerk-middleware-matched
  contexts — that mention becomes stale. Do NOT import this file from client
  code (the `server-only` import throws at build time).
- `web/.env.example` — already documents `NEXT_PUBLIC_API_URL="http://localhost:6969"`
  ("Browser-facing origin of the … API. Must be reachable from the browser.").
  The variable is currently declared but **unused** — this plan is the first
  consumer. The user's `web/.env.local` already defines it.
- `api/src/features/ai/ai.controller.ts` — the target endpoint. Full current body:

  ```ts
  // POST /api/ai/chat — the AI chat backend. The global ClerkAuthGuard requires a
  // signed-in user (the web proxy forwards the caller's Clerk token). Streams a
  // UI-message stream via the AI SDK's Node/Express helper.
  @Controller("ai")
  export class AiController {
    constructor(private readonly ai: AiService) {}

    @Post("chat")
    async chat(
      @UserId() userId: string,
      @Body() dto: AiChatDto,
      @Res() res: Response
    ): Promise<void> {
      await this.ai.streamChat({
        res,
        userId,
        messages: dto.messages,
        userLevels: dto.userLevels,
        userLocation: dto.userLocation ?? null,
        locale: dto.locale,
      })
    }
  }
  ```

- `api/src/main.ts:60-65` — CORS already fits browser-direct calls; no change
  needed:

  ```ts
  app.enableCors({
    origin: config.get<string>("WEB_URL") ?? "http://localhost:3000",
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
  ```

  Express's `cors` middleware answers preflight `OPTIONS` before guards run,
  so preflights are not throttled or auth-checked. The api's JSON body-parser
  limit is 100 KB (`JSON_BODY_LIMIT` in `main.ts`) — this replaces the
  proxy's 64 KB pre-check (an oversized body gets an Express 413 before
  reaching the controller).

- `api/src/common/all-exceptions.filter.ts` — every thrown `HttpException`
  renders as `{ error: message }` at its status. Headers already set on the
  `Response` before the throw are preserved (the filter only calls
  `res.status(...).json(...)`).
- `docker-compose.yml` — `web` service sets `API_URL: http://api:6969`
  (server-side, compose-network address) and its comment already anticipates
  this change: "the browser still hits the API through the published port on
  localhost." The api's port 6969 is published to the host.

### Installed-library facts (verified against `web/node_modules`)

- `ai@^6.0.209`, `@ai-sdk/react@^3.0.211`, `@clerk/nextjs@^7.5.7`.
- `DefaultChatTransport` is exported from `"ai"`. Its options
  (`HttpChatTransportInitOptions`) include
  `api?: string` (defaults to `'/api/chat'`),
  `headers?: Resolvable<Record<string, string> | Headers>`, where
  `type Resolvable<T> = MaybePromiseLike<T> | (() => MaybePromiseLike<T>)` —
  i.e. an **async function is valid** and is resolved per request.
- `useChat({ transport })` accepts the transport instance. Per-request
  `sendMessage(msg, { body })` extras are merged into the outgoing JSON body
  by the default transport, exactly as they reach the api today through the
  transparent proxy — the api's `AiChatDto` (with `whitelist: true` stripping
  unknown keys like `id`/`trigger`) needs no change.
- Client-side Clerk tokens come from `useAuth()` (`@clerk/nextjs`):
  `const { getToken } = useAuth()`. Tokens are short-lived (~60 s) and
  `getToken()` transparently returns a fresh one, which is why the header must
  be resolved per request (async `headers` function), never captured once.

### Repo conventions that apply

- api: native ESM — relative imports **must** use `.js` extensions. Throw
  Nest `HttpException`s; never return error sentinels. Prettier: no
  semicolons, double quotes, 2-space indent.
- api tests: Node's built-in runner, `api/test/*.test.ts`, run via
  `pnpm test` (`node --import tsx --test test/*.test.ts`). Pattern exemplar:
  `api/test/ai-chat.test.ts` (uses `node:assert/strict` + `node:test`; stubs
  boot-time env vars with `??=` before importing anything that transitively
  pulls `env.validation.ts` — the rate-limit module has **no** imports, so no
  stubs are needed).
- web: `@/*` import alias; user-facing copy defaults to Vietnamese. The
  Vietnamese 429 message ("Too many requests — thử lại sau một phút nhé.")
  must survive the move verbatim.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| api install | `cd api && pnpm install` | exit 0 |
| api typecheck | `cd api && pnpm typecheck` | exit 0 |
| api lint | `cd api && pnpm lint` | exit 0 |
| api tests | `cd api && pnpm test` | all pass (278 today; more after Step 2) |
| web install | `cd web && pnpm install` | exit 0 |
| web typecheck | `cd web && pnpm typecheck` | exit 0 |
| web lint | `cd web && pnpm lint` | exit 0 |
| web tests | `cd web && pnpm test` | all pass (32 today; fewer after Step 6 — the rate-limit tests move to the api) |
| web build | `cd web && pnpm build` | exit 0 |
| Run both (smoke) | `docker compose up --build` from repo root, or `cd api && pnpm dev` + `cd web && pnpm dev` | web on :3000, api on :6969 |

## Scope

**In scope** (the only files you should modify/create/delete):

- `api/src/features/ai/chat-rate-limit.ts` (create — ported limiter)
- `api/src/features/ai/ai.controller.ts` (add rate-limit check; refresh doc comment)
- `api/test/ai-chat-rate-limit.test.ts` (create — ported tests)
- `web/lib/public-api.ts` (create — browser-facing API base URL)
- `web/features/chat/ai-native-dashboard.tsx` (switch `useChat` to a direct transport)
- `web/app/api/chat/route.ts` (delete)
- `web/app/api/chat/rate-limit.ts` (delete)
- `web/app/api/chat/rate-limit.test.ts` (delete — ported to api first)
- `web/proxy.ts` (remove the now-dead `/api/chat` matcher entry and `/api/` branch)
- `web/lib/api.ts` (comment-only: drop the stale `/api/chat` mention in the `sharedFetchConfig` JSDoc)
- `docker-compose.yml` (make `NEXT_PUBLIC_API_URL` explicit for the web service)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `api/src/features/ai/ai.service.ts`, `ai-chat.dto.ts`, `player-matching.ts` —
  the AI logic and validation are correct as-is; direct calls send the same
  JSON body the proxy forwarded.
- `api/src/main.ts` — CORS, body limits, and the global prefix already
  support this flow. If a change here seems required, that's a STOP condition.
- `api/src/app.module.ts` / the global `ThrottlerGuard` — the 120 req/min/IP
  throttle stays; the per-user chat limit is additive, not a replacement.
- `web/lib/api.ts` beyond the one JSDoc line — it is `server-only` and must
  stay that way; do not export anything from it for client use.
- Clerk configuration, `web/.env.example` (already documents
  `NEXT_PUBLIC_API_URL`), and any `.env`/`.env.local` file (never edit or
  commit user env files).
- Everything else under `web/features/chat/` (Stream Chat community chat —
  unrelated to the AI chat).

## Git workflow

- Branch: `advisor/010-ai-chat-direct-to-api` off `master`.
- Commit per logical unit, matching repo style (lowercase scope prefix, e.g.
  `api: move per-user AI chat rate limit into the ai feature`,
  `web: call POST /api/ai/chat directly, drop the /api/chat proxy`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Ordered so the app works between every step: the api gains its own rate limit
first (briefly double-limited alongside the proxy — harmless, same 10/min
window), then the client switches, then the proxy is deleted.

### Step 1: Port the rate limiter into the api's `ai` feature

Create `api/src/features/ai/chat-rate-limit.ts` with the exact logic of
`web/app/api/chat/rate-limit.ts` (same constants `WINDOW_MS = 60_000`,
`MAX_REQUESTS = 10`, `MAX_TRACKED_USERS = 10_000`; same `sweepStale`; same
`allowRequest(userId: string, now = Date.now()): boolean` export). Update the
header comment: it now guards `POST /api/ai/chat` directly (no web proxy),
and the PROTOTYPE LIMITATION paragraph should say the window state is
per-api-instance and resets on restart — swap for a shared store (Redis) if
the api ever runs >1 replica. The module needs no imports, so the `.js`
extension rule doesn't come up.

**Verify**: `cd api && pnpm typecheck` → exit 0.

### Step 2: Port the limiter tests to the api's node:test runner

Create `api/test/ai-chat-rate-limit.test.ts` covering every case in
`web/app/api/chat/rate-limit.test.ts` (first 10 allowed; 11th rejected; still
rejected later in-window; fresh window at exactly `now + 60_000` with full
quota; independent windows per user). Translate vitest idioms to the repo's
node:test style — model the file structure on `api/test/ai-chat.test.ts`
(`import assert from "node:assert/strict"`, `import { test } from "node:test"`,
`void test("...", () => { ... })`). No env stubs needed (the module imports
nothing). Import with the `.js` extension:
`import { allowRequest } from "../src/features/ai/chat-rate-limit.js"`.
Use distinct `userId` strings per test — the module's `Map` is shared across
the whole test process.

**Verify**: `cd api && pnpm test` → all pass, including the new file's tests
(count increases from 278).

### Step 3: Enforce the limit in `AiController` and refresh its doc comment

In `api/src/features/ai/ai.controller.ts`:

1. Add imports: `HttpException` and `HttpStatus` to the existing
   `@nestjs/common` import, and
   `import { allowRequest } from "./chat-rate-limit.js"`.
2. At the top of `chat(...)`, before `streamChat`:

   ```ts
   if (!allowRequest(userId)) {
     // Set before the throw: AllExceptionsFilter reuses this Response, so the
     // header survives onto the { error } JSON it renders.
     res.setHeader("Retry-After", "60")
     throw new HttpException(
       "Too many requests — thử lại sau một phút nhé.",
       HttpStatus.TOO_MANY_REQUESTS
     )
   }
   ```

3. Update the controller's doc comment: the browser now calls this endpoint
   directly (CORS-allowed from `WEB_URL`, Clerk Bearer attached client-side);
   mention the per-user 10/min limit on top of the global per-IP throttle.

**Verify**: `cd api && pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

### Step 4: Add the browser-facing API base URL constant

Create `web/lib/public-api.ts`:

```ts
// Browser-facing origin of the NestJS api. Unlike `lib/api.ts` (server-only,
// compose-network address), this is inlined at build time and must be
// reachable from the user's browser — e.g. the host-published port in
// docker-compose. Keep the literal `process.env.NEXT_PUBLIC_API_URL`
// expression: Next.js replaces it textually during the build.
export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6969"
```

No `"use client"` needed (it's importable from either side); crucially it must
NOT import from `@/lib/api` (`server-only`).

**Verify**: `cd web && pnpm typecheck` → exit 0.

### Step 5: Point `useChat` at the api with an auth-attaching transport

In `web/features/chat/ai-native-dashboard.tsx`:

1. Add `DefaultChatTransport` to the existing `import { ... } from "ai"` list.
2. Add `import { useAuth } from "@clerk/nextjs"` and
   `import { PUBLIC_API_URL } from "@/lib/public-api"`.
3. Inside `AiNativeDashboardView`, replace line 256
   (`const { messages, sendMessage, status, setMessages } = useChat()`) with:

   ```tsx
   const { getToken } = useAuth()
   // The transport resolves headers per request, so each send attaches a
   // fresh short-lived Clerk token. `getToken` is read through a ref: the
   // transport is created once (stable identity for useChat), while Clerk may
   // hand out a new `getToken` across renders.
   const getTokenRef = React.useRef(getToken)
   React.useEffect(() => {
     getTokenRef.current = getToken
   }, [getToken])
   const [transport] = React.useState(
     () =>
       new DefaultChatTransport({
         api: `${PUBLIC_API_URL}/api/ai/chat`,
         headers: async () => ({
           Authorization: `Bearer ${(await getTokenRef.current()) ?? ""}`,
         }),
       })
   )
   const { messages, sendMessage, status, setMessages } = useChat({ transport })
   ```

   (A ref assignment inside an effect is fine — the repo's eslint rule bans
   synchronous **setState** in effects, not ref writes.)

Leave `submit()` and its `sendMessage(..., { body: ... })` call untouched —
the default transport merges those per-request body fields into the JSON
payload just as the proxy forwarded them.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 6: Delete the proxy route and its middleware carve-outs

1. Delete the directory `web/app/api/chat/` (all three files: `route.ts`,
   `rate-limit.ts`, `rate-limit.test.ts` — the tests were ported in Step 2).
   `web/app/api/` should now be empty/gone; there are no other web API routes.
2. In `web/proxy.ts`: remove the `"/api/chat"` matcher entry and its comment,
   and remove the now-unreachable `/api/` branch so the handler body is just
   `return handleIntl(req)`. Keep the first matcher pattern (it already
   excludes `/api`).
3. In `web/lib/api.ts`, update the `sharedFetchConfig` JSDoc's context list
   "(dashboard layout, pages, server actions, /api/chat)" to drop
   `/api/chat`.

**Verify**:
- `cd web && pnpm typecheck && pnpm lint && pnpm test` → exit 0
  (`lib/shared/helpers.test.ts` remains the only web test file).
- `grep -rn "api/chat" web --include="*.ts" --include="*.tsx" -l | grep -v node_modules` → no output.

### Step 7: Make the browser-facing URL explicit in docker-compose

In `docker-compose.yml`, under the `web` service's `environment`, alongside
`API_URL: http://api:6969`, add:

```yaml
      # Inlined into the client bundle at dev/build time: the browser reaches
      # the api via the host-published port, not the compose-network name.
      NEXT_PUBLIC_API_URL: http://localhost:6969
```

(This makes the compose setup self-sufficient even if a user's
`web/.env.local` lacks the variable; the api's `6969:6969` port publish and
the comment about the browser hitting the published port already exist.)

**Verify**: `docker compose config` → renders without error and shows
`NEXT_PUBLIC_API_URL: http://localhost:6969` for the web service.

### Step 8: Full-suite gates and streaming smoke test

Run all gates:

- `cd api && pnpm typecheck && pnpm lint && pnpm build && pnpm test` → all exit 0.
- `cd web && pnpm typecheck && pnpm lint && pnpm build && pnpm test` → all exit 0.

Then smoke-test the live flow (requires the operator's real env:
`api/.env` with `DATABASE_URL`, Clerk keys, `OPENROUTER_API_KEY`;
`web/.env.local` with Clerk keys). Start both apps (`docker compose up
--build`, or `pnpm dev` in each). In a browser, sign in, open
`/vi/dashboard`, and send a chat message ("tìm sân cầu lông gần đây").
Confirm:

1. The network tab shows `POST http://localhost:6969/api/ai/chat` (not
   `/api/chat` on :3000) returning 200 with a streamed body, preceded by a
   successful `OPTIONS` preflight.
2. Text streams into the thread and a tool card (courts) renders.
3. Rapidly sending messages past 10 in a minute yields a 429 whose JSON is
   `{ "error": "Too many requests — thử lại sau một phút nhé." }` with a
   `Retry-After: 60` header.

If you cannot run the smoke test (no env/DB/browser available), complete the
command gates, note the smoke test as NOT RUN in the status row, and report it
for the operator.

## Test plan

- **New**: `api/test/ai-chat-rate-limit.test.ts` (Step 2) — full port of the
  vitest suite: 10-allowed cap, 11th rejected, in-window persistence of
  rejection, exact-boundary window rollover with fresh quota, per-user
  isolation. Pattern: `api/test/ai-chat.test.ts`.
- **Deleted**: `web/app/api/chat/rate-limit.test.ts` (superseded by the port).
- **Unchanged**: `api/test/ai-chat.test.ts` (DTO validation + player matching)
  must keep passing — the request body shape does not change.
- Verification: `cd api && pnpm test` all green; `cd web && pnpm test` all
  green with only `lib/shared/helpers.test.ts` remaining.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0, with the new rate-limit tests passing
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` all exit 0
- [ ] `test ! -e web/app/api` → exit 0 (no web API routes remain)
- [ ] `grep -rn "api/chat" web --include="*.ts" --include="*.tsx" | grep -v node_modules` → no matches
- [ ] `grep -n "PUBLIC_API_URL" web/features/chat/ai-native-dashboard.tsx` → at least one match
- [ ] `grep -n "allowRequest" api/src/features/ai/ai.controller.ts` → at least one match
- [ ] `grep -n "NEXT_PUBLIC_API_URL" docker-compose.yml` → one match
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated (note if the Step 8 smoke test was not run)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows in-scope files changed and the "Current state"
  excerpts no longer match (especially `ai-native-dashboard.tsx:256` or the
  proxy route).
- `DefaultChatTransport` is not exported from `"ai"`, or its options reject an
  async `headers` function at typecheck — the installed AI SDK version has
  moved; do not hand-roll a custom `fetch` wrapper as a workaround.
- `useChat({ transport })` fails to typecheck against `@ai-sdk/react`.
- The Step 8 smoke test hits a CORS failure (preflight rejected or missing
  `Access-Control-Allow-Origin`). The fix would touch `api/src/main.ts`
  (out of scope) — report instead; the likely cause is `WEB_URL` not matching
  the browser origin.
- Making it work seems to require any change to `api/src/features/ai/ai.service.ts`,
  `ai-chat.dto.ts`, or `api/src/main.ts`.
- Messages stream but per-request `body` extras (`userLevels`/`userLocation`/
  `locale`) stop arriving at the api (visible as the model ignoring location/
  level) — the transport's body-merge assumption would be false.

## Maintenance notes

- **This is the first browser→api call in the app.** Everything else goes
  through server-side fetches. Deployment now requires: the api publicly
  reachable at the URL baked into `NEXT_PUBLIC_API_URL` at **build** time, and
  the api's `WEB_URL` env set to the deployed web origin (exact match — CORS
  reflects it). A deploy checklist should include both.
- The per-user limiter is still in-memory/per-instance (unchanged prototype
  limitation, now noted in `chat-rate-limit.ts`): swap for a shared store if
  the api scales past one replica. The global `ThrottlerGuard`
  (120 req/min/IP) remains as the outer net.
- The proxy's 64 KB body pre-check is intentionally not ported: the api's
  100 KB Express JSON limit (`JSON_BODY_LIMIT` in `main.ts`) is the
  enforcement now. `AiChatDto`'s comment about "the controller adds a
  serialized-size cap" refers to that parser limit.
- Reviewer scrutiny: the `getTokenRef` indirection in
  `ai-native-dashboard.tsx` (transport identity must stay stable across
  renders while tokens refresh), and that the 429 message stayed verbatim
  Vietnamese.
- Deferred follow-ups: surfacing chat errors (429/401) as a user-visible
  toast via `useChat`'s `onError` (today errors only flip `status` — parity
  with the pre-plan behavior was kept); updating the stale
  `ai-chat-aisdk-v6`-era docs/comments that still describe the proxy
  architecture, if any remain outside the in-scope files.
