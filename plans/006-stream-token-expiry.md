# Plan 006: Expire Stream Chat user tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- api/src/features/stream/ web/lib/api.ts web/features/chat/`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

`StreamService.issueToken` signs Stream Chat user JWTs with no expiration. A
token captured from a browser (logs, proxy, extension, XSS elsewhere) grants
that user's chat identity **forever**, with no natural revocation. Stream's
`createToken` accepts an expiry; the web client should fetch tokens through a
`tokenProvider` so an expired token transparently refreshes.

## Current state

- `api/src/features/stream/stream.service.ts:99-106`:

```ts
async issueToken(
  userId: string,
  name?: string,
  image?: string
): Promise<{ apiKey: string; token: string }> {
  await this.seedForUser(userId, name, image)
  return { apiKey: this.client.key, token: this.client.createToken(userId) }
}
```

  `this.client` is a `stream-chat` `StreamChat` server client. The `stream-chat`
  SDK signature is `createToken(userID: string, exp?: number, iat?: number)`
  where `exp` is a **unix timestamp in seconds** (absolute, not a duration).
  SDK v9 is installed (`api/package.json`: `"stream-chat": "^9.50.0"`).

- Web consumption: `web/lib/api.ts:122` fetches `{ apiKey, token }` from
  `POST /api/stream/token` (server-side, Clerk bearer attached). **You must
  locate where the web app calls `connectUser`** — grep
  `web/features/chat/` and `web/features/` for `connectUser` / `useCreateChatClient`
  / the consumer of that `StreamCredentials` fetch. Whether it passes the
  static token string or a token provider determines Step 2's exact edit.
- Conventions: api ESM `.js` imports; Prettier no-semicolons/double-quotes;
  api test exemplar for this feature: `api/test/stream-service.test.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| api gate | `cd api && pnpm typecheck && pnpm lint && pnpm test` | exit 0 |
| stream tests | `cd api && node --import tsx --test test/stream-service.test.ts` | all pass |
| web gate | `cd web && pnpm typecheck && pnpm lint && pnpm build` | exit 0 |

## Scope

**In scope**:
- `api/src/features/stream/stream.service.ts`
- `api/test/stream-service.test.ts` (extend)
- The single web file that calls `connectUser`/creates the chat client
  (locate in Step 2), plus `web/lib/api.ts` only if the fetch helper needs a
  re-fetch variant.

**Out of scope**:
- `seedForUser` and the demo-seeding logic in `stream.service.ts`.
- Stream channel/message features, SDK version bumps.

## Git workflow

- Branch: `advisor/006-stream-token-expiry`
- One or two commits, e.g. `Expire Stream user tokens after 24h`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Sign with an expiry (api)

In `issueToken`, compute `const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24`
(24 h) and pass it: `this.client.createToken(userId, exp)`. Add a short
comment: 24 h bounds the life of a leaked token; the web client refreshes via
its token provider. Extend `api/test/stream-service.test.ts`: fake client
records `createToken` args; assert the second arg is a number ≈ now+86400 s
(assert a range, e.g. within ±60 s of the expected value — do NOT assert
exact equality on a wall-clock value).

**Verify**: `cd api && pnpm typecheck && node --import tsx --test test/stream-service.test.ts && pnpm test` → all pass.

### Step 2: Make the web client refresh-capable

Locate the `connectUser` (or `useCreateChatClient`) call in `web/features/`.
If it currently passes the token **string**, change it to pass an async
**token provider** function that calls the existing `/api/stream/token` fetch
(from `web/lib/api.ts`) and returns `credentials.token` — `stream-chat`
accepts `connectUser(user, async () => token)` and calls it again on
expiry. Note: the fetch in `web/lib/api.ts` is server-side (attaches the
Clerk bearer via server helpers) — if the chat client is created in a client
component, the token is likely fetched in a server component/action and passed
down as a prop. In that case the provider must call a route/server action that
can re-fetch; if no such client-callable path exists, create a minimal one
following how other client→server calls are done in the chat feature (look for
existing server actions in `web/features/chat/`), or STOP if the wiring is
ambiguous.

**Verify**: `cd web && pnpm typecheck && pnpm lint && pnpm build` → exit 0.

### Step 3: Manual smoke (if dev env available)

Sign in, open the community chat — messages load. (Token expiry itself can't
be observed in a smoke test; the gate is that connect still works via the
provider.) Skip and note if no dev env.

## Test plan

Step 1's api test (expiry arg present and sane). Web has no runner (plan 008);
note the provider as untested-by-automation in your report.

## Done criteria

- [ ] `createToken` is called with an `exp` ≈ now + 24 h
- [ ] Web chat client uses a token provider (or documented equivalent) rather than a one-shot static token
- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build` all exit 0
- [ ] Only in-scope files changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The web chat-client wiring doesn't fit either shape described in Step 2
  (no clean client-callable re-fetch path) — report the actual wiring instead
  of inventing new API surface.
- `stream-chat` v9's `createToken` signature differs from
  `(userID, exp?, iat?)` (check `node_modules/stream-chat` types) — report.
- Any existing stream test fails for reasons beyond adding the `exp` arg.

## Maintenance notes

- If chat sessions routinely outlive 24 h in the field, drop to a shorter exp
  only alongside verified provider-refresh behavior; the provider makes the
  duration tunable server-side.
- Reviewer: confirm no token value ever gets logged, and that the provider
  path re-authenticates via Clerk (not an unauthenticated token mint).
