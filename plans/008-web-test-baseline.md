# Plan 008: Stand up a web test baseline (Vitest)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- web/package.json web/lib/shared/ web/app/api/chat/`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive)
- **Depends on**: plans/002-ci-workflow.md (CI job to extend); benefits from plans/004 (rate-limit module to test)
- **Category**: tests
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

`web` has **zero test infrastructure** — no test script, no runner, no test
files. The checkout flow, booking calendar math, and every pure helper are
verified only by typecheck + manual clicking. This plan adds Vitest with a
small set of high-value unit tests over pure logic, giving future changes
(and future E2E work) a foundation and a `pnpm test` gate to wire into CI.
Scope is deliberately logic-only — component/E2E testing is a later step.

## Current state

- `web/package.json` — scripts are `dev/build/start/lint/format/typecheck`
  only. Next.js 16.2.x, React 19.2.4, TypeScript ^5, ESM (`"type": "module"`).
- Pure-logic candidates (all framework-free):
  - `web/lib/shared/helpers.ts` (~1,500 lines, hand-duplicated twin of
    `api/src/shared/helpers.ts`) — money (`formatVnd`/`compactVnd`), fixed
    +07:00 timezone date helpers (`vnNowIso`, `isoDateOf`, `addDaysIso`,
    `combineDateTime`, `dayLabelFor`), `rangesOverlap`, `refundPctFor`,
    `hashStr` (uint32 — indexing must use `>>>`).
    Note: the api twin already has tests (`api/test/*-helpers.test.ts`) —
    **read `api/test/booking-helpers.test.ts` and `api/test/session-helpers.test.ts`
    first** and mirror relevant cases rather than inventing new ones; identical
    behavior on both copies is exactly what the hand-duplication demands.
  - `web/app/api/chat/rate-limit.ts` — exists only if plan 004 landed
    (`allowRequest(userId, now?)` fixed-window limiter). Skip its tests if
    the file is absent; note that in your report.
- Conventions: Prettier no-semicolons/double-quotes/2-space; `@/*` alias
  (maps to `web/*`); eslint via `web/eslint.config.mjs` (flat config —
  test files must not trip it).

## Commands you will need

| Purpose | Command (inside `web/`) | Expected |
|---------|--------------------------|----------|
| Install | `pnpm add -D vitest` | exit 0 |
| Tests | `pnpm test` (after wiring) | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `web/package.json` (devDep `vitest`, `"test": "vitest run"` script)
- `web/vitest.config.ts` (create)
- `web/lib/shared/helpers.test.ts` (create)
- `web/app/api/chat/rate-limit.test.ts` (create — only if plan 004 landed)
- `web/tsconfig.json` — only if test files/vitest config need an
  include/types tweak to typecheck
- `.github/workflows/ci.yml` — add `pnpm test` to the web job (only if plan
  002 landed)

**Out of scope**:
- React component testing (@testing-library, jsdom) — not in this plan;
  keep the dependency surface minimal (no jsdom needed for pure logic).
- Playwright/E2E — separate future direction (RELEASE.md §5's golden path).
- Any change to `helpers.ts` itself — tests characterize existing behavior;
  a discovered bug is a STOP-and-report, not a fix.

## Git workflow

- Branch: `advisor/008-web-test-baseline`
- Commits: setup, then tests. E.g. `Add Vitest to web` /
  `Add helper + rate-limit unit tests`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install and wire Vitest

`pnpm add -D vitest`; add `"test": "vitest run"` to scripts; create
`web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
})
```

**Verify**: `pnpm test` → runs, reports "no test files found" (exit code may
be non-zero for zero files — acceptable at this step).

### Step 2: Mirror the api helper tests

Read `api/test/booking-helpers.test.ts` and `api/test/session-helpers.test.ts`
(they use `node:test`; you are translating the *cases*, not the runner —
Vitest uses `describe/it/expect`). Create `web/lib/shared/helpers.test.ts`
covering at minimum: `formatVnd`/`compactVnd` known values, `rangesOverlap`
boundary cases, `refundPctFor` tier boundaries, `addDaysIso`/`isoDateOf`
around month/year boundaries with the fixed +07:00 offset, and `hashStr`
returning a non-negative uint32 for a few strings. Import from
`"@/lib/shared"` (the barrel) or the helpers file directly — match how app
code imports it.

**Verify**: `pnpm test` → all pass (expect ~15–25 assertions).

### Step 3: Test the rate limiter (if present)

If `web/app/api/chat/rate-limit.ts` exists, create its test using the
injectable `now`: allows first N, rejects N+1 in-window, resets after the
window elapses, isolates users. If absent, skip and note it.

**Verify**: `pnpm test` → all pass.

### Step 4: Gates + CI

`pnpm typecheck && pnpm lint && pnpm build` must stay green (tsconfig may need
the test files excluded from `next build`'s typecheck or included for
`tsc --noEmit` — resolve whichever breaks, minimally). If
`.github/workflows/ci.yml` exists, add a `pnpm test` step to the web job
between lint and build.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all
exit 0.

## Test plan

This plan *is* the test plan: two new test files, ~20+ cases, all passing via
`pnpm test`.

## Done criteria

- [ ] `cd web && pnpm test` runs Vitest and passes with ≥2 test files
- [ ] Helper tests mirror the api twins' cases (money, dates, overlap, refund tiers, hashStr)
- [ ] `pnpm typecheck && pnpm lint && pnpm build` all still exit 0
- [ ] CI web job runs `pnpm test` (if plan 002's workflow exists)
- [ ] Only in-scope files changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A mirrored test case **fails** against `web/lib/shared/helpers.ts` while
  its twin passes in api — that is shared-copy drift, the exact bug class
  this suite exists to catch. Report the diverging function; do not "fix" the
  test to pass.
- Vitest cannot resolve the `@/*` alias or Next's ESM setup after two config
  attempts — report the error rather than restructuring imports.
- Adding vitest introduces a peer conflict with the installed React/Next.

## Maintenance notes

- Next steps this unlocks (deferred): component tests (add jsdom +
  @testing-library/react), then Playwright on RELEASE.md §5's golden path
  with Clerk test-mode (`+clerk_test` emails, code 424242).
- When either `shared/helpers.ts` copy changes, run both suites — a case
  passing on one side only is drift.
- Reviewer: check test cases were mirrored from the api suites, not invented
  (behavioral twins are the point).
