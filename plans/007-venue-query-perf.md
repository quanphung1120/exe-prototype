# Plan 007: Index the hot venue reads and stop over-fetching for player-only accounts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- api/src/features/bookings/booking.schema.ts api/src/features/bookings/bookings.service.ts api/src/features/seed/seed.service.ts api/src/features/venues/venues.service.ts`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (part C changes a payload branch — verify web gating first)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

Three related costs on every full dashboard load:

- **A.** `listForVenue` runs `find({ venueId, status: { $ne: "expired" } }).sort({ createdAt: 1 })`
  and `listRefundQueue` runs `find({ venueId, "refund.status": "manual" }).sort({ "refund.at": 1 })`;
  neither sort is index-backed for these filters (existing indexes:
  `{venueId, courtId, dateKey}`, `{createdAt: -1}` standalone) — in-memory
  sorts that grow with a venue's entire history.
- **B.** Seed assembly is a 3-stage serial waterfall; the `myWorkspace` reads
  can join the first parallel batch.
- **C.** Player-only accounts (no venue) still get a **full demo-venue
  operator bundle** built and shipped (`activeBundle()`) that the web never
  renders (it redirects to setup before any venue UI mounts).

## Current state

- `api/src/features/bookings/booking.schema.ts:60-77` — current indexes, each
  with a comment explaining its query. Excerpt:

```ts
BookingSchema.index({ venueId: 1, courtId: 1, dateKey: 1 })
BookingSchema.index({ userId: 1, startAt: 1 })
BookingSchema.index({ sessionId: 1 })
BookingSchema.index({ status: 1, holdExpiresAt: 1 })
BookingSchema.index({ status: 1, confirmDeadlineAt: 1 })
BookingSchema.index({ createdAt: -1 })
```

- `api/src/features/bookings/bookings.service.ts:295-325` — `listForVenue`
  (`.find({ venueId, status: { $ne: "expired" } }).sort({ createdAt: 1 }).lean()`)
  and `listRefundQueue`
  (`.find({ venueId, "refund.status": "manual" }).sort({ "refund.at": 1 }).lean()`).
- `api/src/features/seed/seed.service.ts:43-85` — `buildSeed`: first a
  5-way `Promise.all` (courts/players/profile/sessions/assessment), then:

```ts
const { brand, venues } = userId
  ? await this.venues.myWorkspace(userId)
  : { brand: null, venues: [] }
const activeVenueId = venues[0]?.id ?? null
const venue = activeVenueId
  ? await this.venues.venueBundle(activeVenueId)
  : await this.venues.activeBundle()
```

  The comment above it says: when the user has no venues, "`venue` carries a
  structural fallback bundle never rendered before that redirect" — but
  `activeBundle()` actually builds the first demo venue's **full** bundle
  (stats, all reservations, refund queue, CRM, chart series) — two booking
  queries plus serialization, for data the player UI never reads.
- `api/src/features/venues/venues.service.ts` — hosts `myWorkspace`,
  `venueBundle`, `activeBundle` (945 lines; read the three methods before
  editing).
- Conventions: ESM `.js` imports; index declarations carry a comment
  explaining which query they serve (match that style); tests in
  `api/test/venue-helpers.test.ts`, `api/test/bookings-service.test.ts`.
- Web gating to verify in Step 3: the dashboard redirects users with
  `venues.length === 0` to setup before rendering venue UI (comment in
  `seed.service.ts`; confirm in `web/features/` — grep for `venues.length`
  or the setup redirect in the dashboard layout/provider).

## Commands you will need

| Purpose | Command (inside `api/`) | Expected |
|---------|--------------------------|----------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass |
| Web gate (Step 3 only) | `cd web && pnpm typecheck && pnpm build` | exit 0 |

## Scope

**In scope**:
- `api/src/features/bookings/booking.schema.ts` (two new indexes)
- `api/src/features/seed/seed.service.ts` (waterfall + fallback branch)
- `api/src/features/venues/venues.service.ts` (only if adding an
  `emptyBundle()`-style cheap fallback helper there is the cleanest home)

**Out of scope**:
- Windowing/limiting `listForVenue`'s result set — behavior change to the
  operator schedule/analytics; explicitly deferred.
- `web/**` — no web changes; the payload shape for venue owners is unchanged,
  and the no-venue fallback must keep the same *type* (`VenueSeed`).
- The shared type files (`api/src/shared/`, `web/lib/shared/`) — the
  `Seed`/`VenueSeed` types must not change.

## Git workflow

- Branch: `advisor/007-venue-query-perf`
- One commit per part (A/B/C).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 (A): Add the two compound indexes

In `booking.schema.ts`, following the existing commented style:

```ts
// Operator reservation list (`listForVenue`): one venue's bookings ordered by
// creation — lets the sort run off the index instead of in memory.
BookingSchema.index({ venueId: 1, createdAt: 1 })
// Manual-refund worklist (`listRefundQueue`), oldest refund first.
BookingSchema.index({ venueId: 1, "refund.status": 1, "refund.at": 1 })
```

**Verify**: `pnpm typecheck && pnpm test` → exit 0 (index declarations are
build-time inert; Mongoose syncs on boot).

### Step 2 (B): Parallelize `myWorkspace` into the first batch

In `buildSeed`, `myWorkspace(userId)` depends only on `userId` — move it into
the initial `Promise.all` (as a sixth element, with the same
`userId ? ... : Promise.resolve({ brand: null, venues: [] })` guard). Only the
`venueBundle`/fallback call remains dependent (it needs `venues[0]`). Keep
the explanatory comments.

**Verify**: `pnpm typecheck && pnpm test` → all pass (the seed shape is
unchanged; if a seed-related test asserts call order, update the fake).

### Step 3 (C): Cheap fallback bundle for no-venue accounts

First **confirm the web gating**: grep the web dashboard layout/providers for
the no-venue redirect (e.g. `venues.length === 0` → setup). Also grep
`web/features/` for reads of `seed.venue` outside the venue workspace — the
chat tools and any player component must not depend on the demo venue bundle.
If anything in the player surface reads `seed.venue`, STOP and report.

Then replace the `: await this.venues.activeBundle()` branch with a cheap
structural fallback: a `VenueSeed`-shaped object with empty arrays and
zeroed stats built without any DB reads. Preferred: add a small
`emptyBundle(): VenueSeed` (pure, no queries) near `venueBundle` in
`venues.service.ts`, reusing whatever default/stat-shaping helpers
`venueBundle` uses so the shape stays type-correct, and call it from
`buildSeed`. Anonymous (no `userId`) callers should also get `emptyBundle()`
— check whether any anonymous path renders venue data first (the dashboard
requires sign-in, so it should not).

**Verify**: `pnpm typecheck && pnpm test` → all pass; then
`cd ../web && pnpm typecheck && pnpm build` → exit 0 (types still align).
If a dev env exists: sign in as a user with no venue → dashboard loads,
redirect to setup works, no runtime errors reading venue data; sign in as a
venue owner → venue workspace unchanged.

## Test plan

- Extend or add an api test (e.g. in `api/test/venue-helpers.test.ts` or a
  small new `seed-service.test.ts` following `payments-service.test.ts`'s
  TestingModule pattern) asserting: for a userId whose `myWorkspace` returns
  no venues, `buildSeed` does **not** call `venueBundle`/`activeBundle`
  (fake venues service records calls) and the returned `venue` has empty
  reservations/customers.
- Existing suites must stay green: `pnpm test`.

## Done criteria

- [ ] Both compound indexes declared with explanatory comments
- [ ] `myWorkspace` runs inside the first `Promise.all`
- [ ] No-venue accounts get a no-query `emptyBundle()`; venue owners' payload byte-identical in shape
- [ ] New test proves no venue-bundle queries for no-venue users
- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] `cd web && pnpm typecheck && pnpm build` exit 0
- [ ] Only in-scope files changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any player-surface component or the chat route's tools read `seed.venue`
  (Step 3's grep) — the fallback would break them; report what reads it.
- `VenueSeed` cannot be constructed without DB reads (some field has no
  sensible empty value) — report the field rather than fabricating data.
- An existing test encodes `activeBundle()` as the no-venue behavior in a way
  that looks intentional (beyond a fake needing updates) — report.

## Maintenance notes

- The deferred windowing of `listForVenue` (bounding history to the rendered
  analytics horizon) is the next perf step once product confirms the horizon.
- Reviewer: check Atlas index build impact is acceptable (collection is small
  now — fine; on a large production collection, background index build
  considerations apply).
- If venue analytics later needs the demo bundle for "preview mode", gate it
  behind an explicit query param instead of restoring the always-on fetch.
