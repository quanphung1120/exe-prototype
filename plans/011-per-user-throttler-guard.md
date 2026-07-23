# Plan 011: Replace the hand-rolled AI-chat limiter with a per-user ThrottlerGuard subclass applied to sensitive routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 40ef1c4..HEAD -- api/src/features/ai/ api/src/features/payments/payments.controller.ts api/src/common/ api/test/ai-chat-rate-limit.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plans 009/010 already merged)
- **Category**: tech-debt / security
- **Planned at**: commit `40ef1c4`, 2026-07-23

## Why this matters

`POST /api/ai/chat` currently enforces its per-user 10/min limit through a
hand-rolled fixed-window module (`api/src/features/ai/chat-rate-limit.ts`)
called imperatively inside the controller. It works, but it is a second,
parallel rate-limiting mechanism next to the `@nestjs/throttler` machinery the
app already runs globally (per-IP, 120/min), it reimplements window/sweep
logic the library provides, and it cannot be reused on other routes without
copy-paste. This plan replaces it with a small `UserThrottlerGuard extends
ThrottlerGuard` in `src/common/` that keys on the Clerk userId, applied via a
`@UserThrottle()` decorator to the two per-user cost-sensitive routes: the
paid-LLM `POST /api/ai/chat` and the SePay-checkout-creating
`POST /api/payments/checkout`. Behavior on the chat route is preserved
(10/min per user, HTTP 429, Vietnamese message, `Retry-After` header).

## Current state

All library facts below were **verified against the installed
`@nestjs/throttler@6.5.0` source** — do not "upgrade" the approach based on
docs for other versions.

### Files

- `api/src/features/ai/chat-rate-limit.ts` — the hand-rolled limiter to
  delete. Exports `allowRequest(userId, now?)`; fixed window 60 000 ms,
  10 req/user, module-scoped `Map`, stale-sweep past 10 000 users.
- `api/src/features/ai/ai.controller.ts` — the only caller:

```ts
// ai.controller.ts:32-40 (inside `chat` handler)
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

- `api/src/features/payments/payments.controller.ts:27-31` — the second route
  to guard:

```ts
/** Start (or resume) a SePay checkout for the caller's own booking hold. */
@Post("checkout")
async checkout(@UserId() userId: string, @Body() body: CheckoutDto) {
  return this.payments.checkout(userId, body.bookingId, body.discountCode)
}
```

  Do NOT guard `@Post("ipn")` in the same file — it is `@Public()`
  (SePay's server calling us, no Clerk user; HMAC-authenticated).

- `api/src/app.module.ts:79-81` — global guard order (relevant because
  route-scoped guards run **after** all global guards in Nest, so by the time
  the new guard runs, `ClerkAuthGuard` has already stashed the userId):

```ts
{ provide: APP_GUARD, useClass: ThrottlerGuard },   // per-IP 120/min
{ provide: APP_GUARD, useClass: ClerkAuthGuard },   // sets userId on req
{ provide: APP_FILTER, useClass: AllExceptionsFilter },
```

  and `app.module.ts:49-51` — `ThrottlerModule.forRoot({ throttlers: [{ ttl:
  60_000, limit: 120 }] })`.

- `api/src/common/request-auth.ts` — exports `getRequestUserId(req):
  string | undefined` / `setRequestUserId(req, userId)`. `ClerkAuthGuard`
  calls the setter after verifying the Bearer token; the new guard reads the
  getter. (The Clerk middleware `getAuth(req)` is NOT populated in this app —
  the guard verifies tokens directly. Never use `getAuth` here.)
- `api/test/ai-chat-rate-limit.test.ts` — 5 unit tests for `allowRequest`;
  deleted and replaced by a guard test in this plan.

### Verified `@nestjs/throttler@6.5.0` facts the design relies on

- `ThrottlerModule` is decorated `@Global()` and its `forRoot` **exports**
  `THROTTLER_OPTIONS` and `ThrottlerStorage` — so a `ThrottlerGuard` subclass
  used via `@UseGuards(...)` in any feature module resolves its constructor
  dependencies without importing anything. No module wiring needed.
- Default tracker is `req.ip` (`throttler.guard.js:141-143`); overriding
  `protected getTracker(req)` is the supported seam.
- Default key = `sha256(\`${ClassName}-${handlerName}-${throttlerName}-${tracker}\`)`
  — the global per-IP guard (tracker `req.ip`) and the new per-user guard
  (tracker `user:<id>`) therefore use **distinct buckets** in the shared
  in-memory `ThrottlerStorageService` even on the same route. No collision.
- `handleRequest(requestProps)` is a `protected` method receiving
  `{ context, limit, ttl, throttler, blockDuration, getTracker, generateKey }`
  — overriding it to substitute `limit`/`ttl` is how the subclass gets its own
  limits **without** the library's `@Throttle()` decorator.
- **`blockDuration: 0` disables throttling entirely** (the storage service
  immediately un-blocks when `timeToBlockExpire <= 0`). The library's own
  default is `blockDuration || ttl` (`throttler.guard.js:84`). The override
  MUST pass `blockDuration: ttl`, never 0.
- On a blocked request the base guard sets `Retry-After: <seconds-to-unblock>`
  on the response **before** throwing (`throttler.guard.js:119-122`), and
  `AllExceptionsFilter` reuses that same Response — so the header survives
  onto the `{ error }` JSON exactly like the current hand-rolled code. The
  value becomes dynamic (seconds left) instead of the hardcoded `"60"`;
  that is an improvement, and no web code reads the value.
- `protected throwThrottlingException(context, detail)` throws
  `ThrottlerException` (an `HttpException` with status 429) — override it to
  keep the Vietnamese message.

### ⚠️ The one trap: do NOT use the library's `@Throttle()` decorator

`@Throttle({ default: { limit: 10, ttl: 60_000 } })` on a handler writes
metadata that the **global per-IP `ThrottlerGuard` also reads** — it would
silently drop that route's per-IP limit from 120/min to 10/min (shared-NAT
users would trip it). This is exactly why the plan introduces its own
`@UserThrottle()` decorator with its own metadata key that only
`UserThrottlerGuard` reads.

### Repo conventions

- Native ESM: **all relative imports use `.js` extensions**
  (e.g. `from "./request-auth.js"`).
- Prettier: no semicolons, double quotes, 2-space indent, 80-col.
- Cross-cutting request machinery lives in `src/common/` (see
  `clerk-auth.guard.ts`, `roles.guard.ts`, `public.decorator.ts` as
  exemplars — match their doc-comment style: a block comment explaining *why*
  above the class).
- Tests: Node's built-in runner via tsx, `api/test/*.test.ts`, plain
  `assert/strict` + `node:test`, no Nest testing module (see
  `test/ai-chat-rate-limit.test.ts` and the env-stub preamble in
  `test/ai-chat.test.ts`).

## Commands you will need

Run from `api/` (each app is standalone — there is no root package.json):

| Purpose    | Command                                                        | Expected on success |
|------------|----------------------------------------------------------------|---------------------|
| Install    | `pnpm install`                                                 | exit 0              |
| Typecheck  | `pnpm typecheck`                                               | exit 0, no errors   |
| Lint       | `pnpm lint`                                                    | exit 0              |
| All tests  | `pnpm test`                                                    | all pass            |
| One test   | `node --import tsx --test test/user-throttler.guard.test.ts`   | all pass            |

## Scope

**In scope** (the only files you should modify):
- `api/src/common/user-throttler.guard.ts` (create)
- `api/src/features/ai/ai.controller.ts`
- `api/src/features/ai/chat-rate-limit.ts` (delete)
- `api/src/features/payments/payments.controller.ts`
- `api/test/ai-chat-rate-limit.test.ts` (delete)
- `api/test/user-throttler.guard.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `api/src/app.module.ts` — the global per-IP throttler and guard order stay
  exactly as they are; the new guard is route-scoped only.
- `api/src/features/payments/payments.controller.ts` handlers `ipn` and
  `byBooking` — `ipn` is `@Public()`/HMAC-authenticated (no user to key on);
  `byBooking` is a cheap poll.
- Anything under `web/` — the browser only checks for status 429; no web
  change is needed.
- `api/src/features/stream/**` — stream token minting was considered and
  excluded by the operator.

## Git workflow

- Branch: `advisor/011-per-user-throttler-guard` (matches prior advisor
  branches).
- Commit message style, from `git log`: lowercase `api: <imperative summary>`
  (e.g. `api: move per-user AI chat rate limit into the ai feature`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `api/src/common/user-throttler.guard.ts`

Create the guard + decorator + metadata key in one file. Target shape
(load-bearing — match it closely; comments may be tightened but keep the
`@Throttle()` warning and the multi-instance caveat):

```ts
import { SetMetadata, type ExecutionContext } from "@nestjs/common"
import {
  ThrottlerGuard,
  ThrottlerException,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from "@nestjs/throttler"
import type { Request } from "express"

import { getRequestUserId } from "./request-auth.js"

/**
 * Per-user rate limit for cost-sensitive routes (paid-LLM chat, SePay
 * checkout creation). The global ThrottlerGuard keys on IP — wrong for
 * bounding what one signed-in account can spend (NATs share an IP; one user
 * can rotate IPs). This subclass keys on the Clerk userId instead.
 *
 * Usage (route-scoped, layered on top of the global per-IP guard):
 *
 *   @UseGuards(UserThrottlerGuard)
 *   @UserThrottle({ limit: 10, ttl: 60_000 })
 *   @Post("chat")
 *
 * Limits come from our own `@UserThrottle()` metadata, NEVER the library's
 * `@Throttle()` decorator — the global per-IP ThrottlerGuard reads that same
 * metadata and would silently drop the route's per-IP limit too.
 *
 * Route-scoped guards run after every global guard, so ClerkAuthGuard has
 * already verified the token and stashed the userId (request-auth.ts) by the
 * time getTracker runs; the ip fallback is defense-in-depth only.
 *
 * PROTOTYPE LIMITATION: backed by the module's in-memory ThrottlerStorage —
 * per-api-instance, resets on restart. Fine for the single-instance
 * prototype; with >1 replica, swap the storage for a shared store (e.g.
 * Redis) via ThrottlerModule's `storage` option.
 */

export type UserThrottleOptions = { limit: number; ttl: number }

export const USER_THROTTLE_KEY = "user-throttle"

/** Per-user limit for this route: `limit` requests per `ttl` ms. */
export const UserThrottle = (options: UserThrottleOptions) =>
  SetMetadata(USER_THROTTLE_KEY, options)

const DEFAULT_OPTIONS: UserThrottleOptions = { limit: 10, ttl: 60_000 }

export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>) {
    const userId = getRequestUserId(req as Request)
    return userId ? `user:${userId}` : `ip:${req.ip}`
  }

  protected override async handleRequest(
    props: ThrottlerRequest
  ): Promise<boolean> {
    const { limit, ttl } =
      this.reflector.getAllAndOverride<UserThrottleOptions | undefined>(
        USER_THROTTLE_KEY,
        [props.context.getHandler(), props.context.getClass()]
      ) ?? DEFAULT_OPTIONS
    // blockDuration MUST be ttl: the storage layer treats 0 as "immediately
    // unblocked", which disables throttling entirely.
    return super.handleRequest({ ...props, limit, ttl, blockDuration: ttl })
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail
  ): Promise<void> {
    // Base guard already set Retry-After on the response; AllExceptionsFilter
    // reuses that Response, so the header survives onto the { error } JSON.
    throw new ThrottlerException(
      "Too many requests — thử lại sau một phút nhé."
    )
  }
}
```

Notes for the executor:
- No `@Injectable()` needed (`ThrottlerGuard` subclasses inherit constructor
  param metadata; Nest resolves `@UseGuards(UserThrottlerGuard)` from the
  global ThrottlerModule's exported providers). If DI fails at runtime in
  Step 6's tests, see STOP conditions.
- If `ThrottlerRequest` or `ThrottlerLimitDetail` are not exported from
  `@nestjs/throttler`'s root in a way that satisfies `pnpm typecheck`, check
  `node_modules/@nestjs/throttler/dist/index.d.ts` — both are re-exported
  (`throttler.guard.interface`). Do not substitute `any`.

**Verify**: `cd api && pnpm typecheck` → exit 0.

### Step 2: Switch `POST /api/ai/chat` to the guard

In `api/src/features/ai/ai.controller.ts`:

1. Add imports: `UseGuards` from `@nestjs/common`;
   `{ UserThrottle, UserThrottlerGuard } from "../../common/user-throttler.guard.js"`.
2. Remove the `allowRequest` import and the whole `if (!allowRequest(userId))
   { ... }` block (lines 32-40 excerpted above), plus the now-unused
   `HttpException`/`HttpStatus` imports.
3. Decorate the handler:

```ts
@UseGuards(UserThrottlerGuard)
@UserThrottle({ limit: 10, ttl: 60_000 })
@Post("chat")
async chat(
```

4. Update the controller's header comment: it still says "see
   chat-rate-limit.ts" — point it at the guard instead (per-user 10/min via
   `UserThrottlerGuard`, layered on the global per-IP ThrottlerGuard).

Why 10/min on a **streaming** route (decided 2026-07-23 — do not change the
number): the limiter counts request *starts*, not stream duration, so a
long-lived stream costs one unit. A human turn cycle (send → 5-30s stream →
read → reply) tops out around 3-5/min, so 10 is ~2-3× human cadence — and the
headroom is deliberate: the web app's `useChat` regenerate/retry flows burn a
request each, so tighter limits turn transport hiccups into 429s for honest
users. Worst case under this limit is 10 concurrent streams per user per
minute — bounded cost, accepted; a true concurrent-stream cap is explicitly
deferred (see Maintenance notes).

**Verify**: `pnpm typecheck` → exit 0; `grep -rn "allowRequest" src/` → only
`chat-rate-limit.ts` itself matches.

### Step 3: Delete the hand-rolled limiter and its test

```bash
git rm api/src/features/ai/chat-rate-limit.ts api/test/ai-chat-rate-limit.test.ts
```

**Verify**: `grep -rn "chat-rate-limit\|allowRequest" api/src api/test` → no
matches. `pnpm typecheck` → exit 0.

### Step 4: Guard `POST /api/payments/checkout`

In `api/src/features/payments/payments.controller.ts`, same pattern on the
`checkout` handler only:

```ts
@UseGuards(UserThrottlerGuard)
@UserThrottle({ limit: 10, ttl: 60_000 })
@Post("checkout")
```

(imports: `UseGuards` from `@nestjs/common`, guard/decorator from
`../../common/user-throttler.guard.js`). Add one comment line noting checkout
creates external SePay checkouts, hence the per-user cap. Leave `ipn` and
`byBooking` untouched.

**Verify**: `pnpm typecheck && pnpm lint` → both exit 0.

### Step 5: Write `api/test/user-throttler.guard.test.ts`

Unit-test the guard directly — no Nest app boot (matches the repo's test
style). Setup facts:

- Construct with real collaborators:
  `new UserThrottlerGuard({ throttlers: [{ ttl: 60_000, limit: 120 }] }, new ThrottlerStorageService(), new Reflector())`
  (`ThrottlerStorageService` is exported from `@nestjs/throttler`; `Reflector`
  from `@nestjs/core`). **Must call `await guard.onModuleInit()`** before use
  — that's where the base class builds its throttler list.
- Fake `ExecutionContext`:

```ts
const makeContext = (handler: object, req: object) =>
  ({
    getHandler: () => handler,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ header: () => {} }),
    }),
  }) as unknown as ExecutionContext
```

- A request with a user: `const req = { headers: {}, ip: "1.2.3.4" }` then
  `setRequestUserId(req as never, "user-x")` (import from
  `../src/common/request-auth.js`).
- Route metadata: set it directly on the fake handler function —
  `Reflect.defineMetadata(USER_THROTTLE_KEY, { limit: 3, ttl: 60_000 }, handler)`
  (import `"reflect-metadata"` first; `Reflector.getAllAndOverride` reads
  exactly this). Omitting metadata exercises the 10/60s default.
- `ThrottlerStorageService` arms real `setTimeout`s — call
  `storage.onApplicationShutdown()` at the end of each test (or in a shared
  `after`) so the node:test process exits.
- Copy the env-stub preamble from `test/ai-chat.test.ts:14-23` only if
  imports transitively pull `env.validation.ts`; `request-auth.ts` and the
  guard file do not, so it should be unnecessary — verify by running the test.

Test cases (5):
1. allows `limit` calls for one user, and call `limit+1` rejects — assert
   `canActivate` resolves `true` 3× then the 4th **rejects** with a
   `ThrottlerException` whose `getStatus() === 429` and whose message contains
   `"thử lại sau một phút"`.
2. distinct userIds get independent quotas (user-a capped, user-b still
   allowed) — same handler, different requests.
3. with no metadata on the handler, the default 10/60s applies (11th call
   rejects).
4. with no userId on the request, the tracker falls back to IP: two requests
   with different `ip` values are counted independently.
5. per-route isolation: the same user capped on handler A is still allowed on
   handler B (different `getHandler` identity → different bucket).

**Verify**: `node --import tsx --test test/user-throttler.guard.test.ts` →
5 tests pass, process exits cleanly (no hang).

### Step 6: Full gates + index

Run `pnpm typecheck && pnpm lint && pnpm test` in `api/`, and
`pnpm typecheck && pnpm lint` in `web/` (should be untouched — this is a
no-regression check only). Update the plan 011 row in `plans/README.md`.

**Verify**: all commands exit 0; `pnpm test` shows the 5 old
`ai-chat-rate-limit` tests gone and 5 new guard tests passing (net test count
unchanged: 283).

## Test plan

Covered by Step 5 (file, cases, and pattern specified there). Structural
model: `test/ai-chat-rate-limit.test.ts` (being replaced) for tone/assertion
style; `test/ai-chat.test.ts` for the env-stub preamble if needed.

## Done criteria

Machine-checkable. ALL must hold (from `api/` unless noted):

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; `test/user-throttler.guard.test.ts` exists with 5 passing tests
- [ ] `src/features/ai/chat-rate-limit.ts` and `test/ai-chat-rate-limit.test.ts` are deleted
- [ ] `grep -rn "allowRequest\|chat-rate-limit" src/ test/` → no matches
- [ ] `grep -rn "@Throttle(" src/` → no matches (the library decorator is never used)
- [ ] `grep -n "UserThrottle(" src/features/ai/ai.controller.ts src/features/payments/payments.controller.ts` → one match each
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `@nestjs/throttler`'s version in `api/node_modules/@nestjs/throttler/package.json`
  is not 6.x — the `handleRequest`/`getTracker`/`throwThrottlingException`
  seams and the `blockDuration` semantics were verified against 6.5.0 only.
- Nest fails to instantiate `UserThrottlerGuard` via `@UseGuards` (DI error
  mentioning `THROTTLER:MODULE_OPTIONS` or `ThrottlerStorage`) — do not start
  registering providers or importing ThrottlerModule into feature modules on
  your own; report instead.
- A test can only pass by calling `onModuleInit` conditionally or by faking
  `ThrottlerStorageService` — that means the base-class lifecycle assumption
  is wrong; report.
- You find any other caller of `allowRequest` beyond `ai.controller.ts`.

## Maintenance notes

- **Never** add the library's `@Throttle()` decorator to a route that also
  has the global guard (i.e. any route) without re-reading the trap note in
  "Current state" — it reconfigures the per-IP limit too.
- New cost-sensitive routes get the same two-decorator pair; pick limits per
  route via `@UserThrottle({ limit, ttl })`.
- On horizontal scaling, both the global throttler and this guard need a
  shared storage (`ThrottlerModule`'s `storage` option — one swap covers
  both, which is an improvement over the deleted hand-rolled Map).
- Reviewer should scrutinize: `blockDuration: ttl` (not 0) in the
  `handleRequest` override, and that `ipn` stayed unguarded.
- Deferred: rolling-window/shared-store limiter (Redis) — out of scope until
  multi-replica deployment is real.
- Deferred: a per-user **concurrent open-stream cap** for `/ai/chat` (~2-3
  parallel streams, tracked in `AiService` around `streamChat` with decrement
  on close/abort). The window limiter cannot distinguish 10 requests spread
  over a minute from 10 fired at once holding 10 parallel LLM streams;
  revisit if burst abuse or provider-quota pressure appears. This belongs in
  the service (stream lifecycle), NOT in `UserThrottlerGuard` — a guard never
  sees the stream end.
