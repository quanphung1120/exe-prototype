# Plan 012: Promote UserThrottlerGuard to a global layer — per-IP + per-user throttling on every authenticated route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 263897f..HEAD -- api/src/common/user-throttler.guard.ts api/src/app.module.ts api/src/features/ai/ai.controller.ts api/src/features/payments/payments.controller.ts api/test/user-throttler.guard.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED (touches the global guard chain)
- **Depends on**: plans/011-per-user-throttler-guard.md — **merged**. This
  plan edits files created by 011's commit `263897f`
  (branch `advisor/011-per-user-throttler-guard`). If
  `api/src/common/user-throttler.guard.ts` does not exist on your base
  commit, STOP: 011 has not been merged yet.
- **Category**: security / tech-debt
- **Planned at**: commit `263897f` (011's commit), 2026-07-23

## Why this matters

After plan 011 the api has a global per-IP throttle (120/min) plus per-user
throttles on exactly two routes (AI chat, SePay checkout). Every other
authenticated route is bounded only per-IP — one signed-in user rotating IPs
has no account-level ceiling at all. The operator wants two full layers
(decided 2026-07-23): **120/min per IP** (pre-auth, protects public routes
and the JWKS path — unchanged) and **120/min per user** (post-auth, one
shared budget across all authenticated routes). A user rotating IPs is then
still capped at 120/min total; a NAT full of legit users is not squeezed
below what each account is individually allowed. Routes with a
`@UserThrottle()` decorator (chat 10/min, checkout 10/min) keep their
stricter per-route limits.

## Current state

All library facts were verified against the installed
`@nestjs/throttler@6.5.0` source (see plan 011 for the full list — this plan
adds two more, marked NEW below). Do not redesign from docs for other
versions.

### Files (as of `263897f`)

- `api/src/common/user-throttler.guard.ts` — the guard from plan 011.
  Current shape (excerpts):

```ts
const DEFAULT_OPTIONS: UserThrottleOptions = { limit: 10, ttl: 60_000 }

export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const request = req as unknown as Request
    const userId = getRequestUserId(request)
    return Promise.resolve(userId ? `user:${userId}` : `ip:${request.ip}`)
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
  // ... throwThrottlingException override with the Vietnamese message
}
```

- `api/src/app.module.ts:79-81` — global providers, order is load-bearing
  (global guards run in registration order):

```ts
{ provide: APP_GUARD, useClass: ThrottlerGuard },
{ provide: APP_GUARD, useClass: ClerkAuthGuard },
{ provide: APP_FILTER, useClass: AllExceptionsFilter },
```

- `api/src/features/ai/ai.controller.ts` — the chat handler currently
  carries BOTH decorators (route-scoped registration from 011):

```ts
@UseGuards(UserThrottlerGuard)
@UserThrottle({ limit: 10, ttl: 60_000 })
@Post("chat")
```

- `api/src/features/payments/payments.controller.ts:33-38` — same pair on
  `checkout`. (`ipn` is `@Public()` + HMAC — must stay unthrottled by this
  layer; `byBooking` is an authenticated poll the web app fires while the
  user sits on the SePay return screen — it falls under the new 120/min
  default, which is fine.)
- `api/src/common/public.decorator.ts` — `export const IS_PUBLIC_KEY =
  "isPublic"`; `ClerkAuthGuard` skips routes carrying it. The new global
  layer must skip them too (no user exists there).
- `api/test/user-throttler.guard.test.ts` — 5 unit tests from plan 011;
  builds the guard directly (`new UserThrottlerGuard({ throttlers: [...] },
  storage, new Reflector())` + `await guard.onModuleInit()`), fakes
  `ExecutionContext` via `makeContext(handler, req)`, mints uniquely-named
  handler functions via `makeHandler(limit?, ttl?)` (the base `generateKey`
  includes `handler.name`), sets metadata with
  `Reflect.defineMetadata(USER_THROTTLE_KEY, {...}, handler)`.

### Verified library facts (NEW ones for this plan)

- **`shouldSkip(context)` is an overridable seam**: base implementation is
  `async shouldSkip(_context) { return false }`, awaited at the top of
  `canActivate` (`throttler.guard.js:63, 99-101`). Overriding it to return
  `true` for `@Public()` routes cleanly exempts them.
- **Storage keys are opaque strings** — `storageService.increment(key, ...)`
  uses the key as a plain Map key. The base `generateKey` sha256-hashes
  `${ClassName}-${handlerName}-${throttlerName}-${tracker}`, which makes
  buckets *per-route*. `handleRequest`'s `props.generateKey` is a plain
  function `(context, tracker, name) => string` passed through to the key
  computation (`throttler.guard.js:114-115`) — substituting it in the
  `super.handleRequest({...props, generateKey})` call yields a custom bucket
  shape without touching anything else. Any unique string works; hashing is
  cosmetic.

### The two-bucket design (load-bearing)

One guard, two behaviors, keyed off `@UserThrottle` metadata presence:

- **Metadata present** (chat, checkout): per-route bucket (base
  `generateKey`), route's own limit. Unchanged from 011.
- **Metadata absent** (everything else): ONE shared bucket per user across
  all routes — `generateKey` replaced with
  `(_ctx, tracker) => \`user-global-${tracker}\`` — at the global default
  120/min.

Consequence to preserve, not "fix": requests to `@UserThrottle` routes do
NOT draw from the user's global 120/min budget (the guard runs once per
request and picks one bucket). That is accepted — those routes have their
own, much stricter caps.

### Repo conventions

Same as plan 011: ESM `.js` import extensions; Prettier no-semicolons /
double quotes / 2-space / 80-col; `src/common/` doc-comment style (block
comment explaining *why*); tests via `node:test` + tsx in `api/test/`, no
Nest boot. Lint rules that shaped 011's code and apply here too:
`require-await` (no `async` without `await` — use `Promise.resolve/reject`),
`no-unused-vars` with NO underscore exemption (omit unused params entirely).

## Commands you will need

Run from `api/` (standalone project; run `pnpm install` first — a fresh
worktree has no `node_modules`):

| Purpose    | Command                                                        | Expected on success |
|------------|----------------------------------------------------------------|---------------------|
| Install    | `pnpm install`                                                 | exit 0              |
| Typecheck  | `pnpm typecheck`                                               | exit 0              |
| Lint       | `pnpm lint`                                                    | exit 0              |
| All tests  | `pnpm test`                                                    | all pass            |
| One test   | `node --import tsx --test test/user-throttler.guard.test.ts`   | all pass            |

## Scope

**In scope** (the only files you should modify):
- `api/src/common/user-throttler.guard.ts`
- `api/src/app.module.ts` (ONLY the providers array + its comment)
- `api/src/features/ai/ai.controller.ts` (ONLY removing `@UseGuards` + its import)
- `api/src/features/payments/payments.controller.ts` (ONLY removing `@UseGuards` + its import)
- `api/test/user-throttler.guard.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The existing `ThrottlerModule.forRoot` config and the `ThrottlerGuard` /
  `ClerkAuthGuard` provider lines — layer 1 and auth are unchanged.
- `@UserThrottle({ limit: 10, ttl: 60_000 })` decorators on chat/checkout —
  they stay exactly as they are.
- `api/src/common/clerk-auth.guard.ts`, `public.decorator.ts` — read-only.
- Anything under `web/`.

## Git workflow

- Branch: `advisor/012-global-per-user-throttle`
- Commit style: lowercase `api: <imperative summary>` (see `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend `UserThrottlerGuard` for global registration

In `api/src/common/user-throttler.guard.ts`:

1. Change `DEFAULT_OPTIONS` to `{ limit: 120, ttl: 60_000 }` and comment it:
   the global per-user default, deliberately equal to the per-IP layer
   (operator decision 2026-07-23) so one account rotating IPs gains nothing.
2. Import `IS_PUBLIC_KEY` from `./public.decorator.js`.
3. Add a `shouldSkip` override — `@Public()` routes (health probes, SePay
   `ipn`) have no user and stay covered by the per-IP layer:

```ts
protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ])
  return Promise.resolve(isPublic === true)
}
```

   (`ExecutionContext` becomes a value-position import need? No — type-only:
   `import type { ExecutionContext } from "@nestjs/common"` alongside the
   existing `SetMetadata` import.)
4. Rework `handleRequest` to pick the bucket shape by metadata presence
   (two-bucket design from "Current state" — keep the `blockDuration` comment):

```ts
protected override async handleRequest(
  props: ThrottlerRequest
): Promise<boolean> {
  const routeOptions = this.reflector.getAllAndOverride<
    UserThrottleOptions | undefined
  >(USER_THROTTLE_KEY, [props.context.getHandler(), props.context.getClass()])
  const { limit, ttl } = routeOptions ?? DEFAULT_OPTIONS
  // No @UserThrottle metadata → the global per-user budget: one shared
  // bucket per tracker across every route, instead of the base guard's
  // per-route key.
  const generateKey = routeOptions
    ? props.generateKey
    : (_: unknown, tracker: string) => `user-global-${tracker}`
  // blockDuration MUST be ttl: the storage layer treats 0 as "immediately
  // unblocked", which disables throttling entirely.
  return super.handleRequest({
    ...props,
    limit,
    ttl,
    blockDuration: ttl,
    generateKey,
  })
}
```

   If the `(_: unknown, tracker: string)` lambda trips `no-unused-vars`,
   name the first param and use it trivially, or match
   `ThrottlerGenerateKeyFunction`'s arity however lint allows — do NOT
   change the returned key format.
5. Update the class doc comment: it is now registered globally (third
   `APP_GUARD`, after `ClerkAuthGuard`) with a 120/min-per-user shared
   budget; `@UserThrottle()` routes get stricter per-route buckets; keep the
   `@Throttle()`-trap warning and the multi-instance caveat.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Register globally in `app.module.ts`

Add the guard as the third `APP_GUARD`, strictly after `ClerkAuthGuard`
(global guards run in registration order; this one needs the userId that
`ClerkAuthGuard` stashes):

```ts
{ provide: APP_GUARD, useClass: ThrottlerGuard },
{ provide: APP_GUARD, useClass: ClerkAuthGuard },
{ provide: APP_GUARD, useClass: UserThrottlerGuard },
{ provide: APP_FILTER, useClass: AllExceptionsFilter },
```

Import from `./common/user-throttler.guard.js`. Update the nearby comment
block (it documents the provider order) to describe the two throttle layers:
per-IP 120/min pre-auth, per-user 120/min post-auth (shared bucket),
`@UserThrottle` routes stricter.

**Verify**: `pnpm typecheck` → exit 0. Then boot-check DI wiring without a
real DB is NOT possible here (Mongoose connects at boot) — rely on Step 5's
tests plus typecheck; the operator smoke-tests after merge (see Maintenance
notes).

### Step 3: Remove the now-redundant route-scoped registrations

In `ai.controller.ts` and `payments.controller.ts`: delete the
`@UseGuards(UserThrottlerGuard)` line and the now-unused `UseGuards` +
`UserThrottlerGuard` imports (keep the `UserThrottle` import and decorator!).
Without this, chat/checkout would be counted twice per request (global
instance + route instance share storage and produce identical keys → 2 units
per request, halving the effective limit).

**Verify**: `pnpm typecheck && pnpm lint` → exit 0;
`grep -rn "UseGuards" src/features/ai/ src/features/payments/` → no matches;
`grep -rn "UserThrottle(" src/features/` → still one match per controller.

### Step 4: Update and extend the guard tests

In `api/test/user-throttler.guard.test.ts`:

1. Fix the default-limit test: the loop bound changes from 10 to 120
   (rename the test to mention 120/min). 120 sequential `canActivate` calls
   run in milliseconds — no timing concern.
2. Add test 6 — **global bucket is shared across routes when no metadata**:
   two `makeHandler()` handlers (no limit arg), same user, per-handler limit
   absent; drive 120 allowed calls split across both handlers (e.g. 60+60),
   then assert the 121st call on *either* handler rejects. This is the
   assertion that `generateKey` collapsed to one bucket (the existing test 5
   proves the opposite for metadata routes — keep it).
3. Add test 7 — **`@Public()` routes are skipped entirely**: a handler with
   `Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler)` (import
   `IS_PUBLIC_KEY` from `../src/common/public.decorator.js`), a request with
   no userId, and MORE than `limit` calls (e.g. 130 with the 120 default)
   all resolving `true`.
4. Existing tests 1, 2, 4, 5 need no behavioral changes (they all pass
   explicit metadata or assert per-tracker isolation that still holds) —
   but re-read each against the new guard and adjust only if a bound
   changed. Test 4 (IP fallback, no userId, limit 1 via metadata) still
   passes: metadata present → per-route bucket, unchanged.

**Verify**: `node --import tsx --test test/user-throttler.guard.test.ts` →
7 tests pass, clean exit (the shared `after` hook calling
`storage.onApplicationShutdown()` already exists — keep it).

### Step 5: Full gates

From `api/`: `pnpm typecheck`, `pnpm lint`, `pnpm test` — run as separate
commands (do not pipe through `tail`). From `web/`: `pnpm typecheck`,
`pnpm lint` (no-regression check only; web is untouched).

**Verify**: all exit 0; api test total is 285 (283 from before + 2 new).

## Test plan

Covered by Step 4: two new tests (global shared bucket, `@Public()` skip)
plus one bound update, in the existing `test/user-throttler.guard.test.ts`,
following its own established helpers (`makeGuard`/`makeHandler`/
`makeContext`/`makeReq`).

## Done criteria

Machine-checkable. ALL must hold (from `api/` unless noted):

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 with 285 tests; `user-throttler.guard.test.ts` has 7
- [ ] `grep -c "APP_GUARD" src/app.module.ts` → 3
- [ ] In `src/app.module.ts`, the `UserThrottlerGuard` provider line appears
      AFTER the `ClerkAuthGuard` line (visual check of the providers array)
- [ ] `grep -rn "UseGuards" src/features/` → no matches
- [ ] `grep -rn "UserThrottle(" src/features/` → exactly 2 matches
      (ai.controller.ts, payments.controller.ts), limits unchanged at 10/min
- [ ] `grep -n "limit: 120" src/common/user-throttler.guard.ts` → 1 match
      (DEFAULT_OPTIONS)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `api/src/common/user-throttler.guard.ts` does not exist at your base
  commit — plan 011 (`263897f`) is not merged; this plan cannot proceed.
- The code doesn't match the "Current state" excerpts.
- Test 6 (shared global bucket) cannot be made to pass with the
  `generateKey` substitution — that means the `props.generateKey`
  pass-through assumption is wrong for this library version; report, do not
  invent another keying mechanism.
- Nest typecheck/DI errors on the `APP_GUARD` registration mentioning
  `THROTTLER:MODULE_OPTIONS` or `ThrottlerStorage` — report, do not add
  module imports or providers beyond the one guard line.
- Any test can only pass by weakening its assertion (e.g. dropping the
  121st-call rejection) — report.

## Maintenance notes

- **Operator smoke test after merge** (DI wiring can't be exercised by the
  unit tests): `docker compose up --build`, confirm (a) normal dashboard
  navigation works — no spurious 429s, (b) `GET /health` responds without
  auth, (c) the 11th chat message in a minute still returns the Vietnamese
  429, (d) SePay sandbox `ipn` calls still land (public, skipped by this
  layer).
- The per-user layer throttles by verified account — an attacker with many
  Clerk accounts gets 120/min *each*; the per-IP layer is what resists that.
  Both layers are needed; never remove one because the other exists.
- `@UserThrottle` routes bypass the global user budget (own bucket, own
  limit) — documented design, see "Current state". If a future route needs
  BOTH a strict route cap AND global-budget accounting, that's a redesign
  (count in both buckets), not a tweak.
- On horizontal scaling, one shared-storage swap (`ThrottlerModule`'s
  `storage` option) now covers all three throttle checks.
- Reviewer should scrutinize: provider order in `app.module.ts` (guard after
  `ClerkAuthGuard`), the `@UseGuards` removals (double-count bug if missed),
  and that test 6 genuinely splits calls across two handlers.
