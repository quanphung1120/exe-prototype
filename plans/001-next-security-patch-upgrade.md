# Plan 001: Upgrade Next.js past the 16.2.x middleware-bypass/SSRF advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- web/package.json web/proxy.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

`web` pins `next` to `16.2.6`. `pnpm audit --prod` reports 5 high + 6 moderate
advisories against this version, including a **middleware/proxy bypass in the
App Router** (GHSA-6gpp-xcg3-4w24, patched in `>=16.2.11`) and several SSRF
advisories. This app runs Clerk authentication inside exactly that middleware
layer (`web/proxy.ts`), and it takes real prepaid payments — a known auth-layer
bypass in the installed framework version is a launch blocker. The fix is a
patch-level bump within the same 16.2.x minor.

## Current state

- `web/package.json:37` — `"next": "16.2.6"`; devDependencies pin
  `"eslint-config-next": "16.2.6"`.
- `web/proxy.ts` — Next 16 renamed `middleware` to `proxy`; Clerk wraps
  next-intl here:

```ts
// web/proxy.ts:14-19
export default clerkMiddleware((_auth, req) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }
  return handleIntl(req)
})
```

- `web` is a standalone pnpm project (its own lockfile, no workspace root).
- Repo convention: Prettier no-semicolons/double-quotes; but this plan should
  only touch `package.json` + `pnpm-lock.yaml` — no source edits expected.

## Commands you will need

| Purpose   | Command (run inside `web/`)       | Expected on success |
|-----------|-----------------------------------|---------------------|
| Install   | `pnpm install`                    | exit 0              |
| Audit     | `pnpm audit --prod`               | no `next` advisories remaining |
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Build     | `pnpm build`                      | exit 0 ("Compiled successfully") |

## Scope

**In scope** (the only files you should modify):
- `web/package.json`
- `web/pnpm-lock.yaml` (via `pnpm install`)

**Out of scope** (do NOT touch, even though they look related):
- `web/proxy.ts` — no code change should be needed for a patch bump; if the
  upgrade demands proxy/middleware code changes, that's a STOP condition.
- `api/**` — the api does not depend on Next.
- Any React/`react-dom` version change — stay on `19.2.4` unless the install
  fails on a hard peer requirement (STOP condition if so).

## Git workflow

- Branch: `advisor/001-next-security-patch`
- One commit, message style matches repo (`git log` shows plain imperative
  subjects, e.g. "Add payment-success route and restyle booking confirm/pay
  steps"). Suggested: `Upgrade Next.js to 16.2.x security patch`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Bump next and eslint-config-next

In `web/`, run:

```bash
pnpm add next@~16.2.11 && pnpm add -D eslint-config-next@~16.2.11
```

(`~16.2.11` = latest 16.2.x patch ≥ .11. If pnpm resolves a later 16.2.x
patch, that is fine. Do NOT jump to 16.3+ or 17.)

**Verify**: `grep '"next"' package.json` → shows a version `>=16.2.11 <16.3.0`;
`pnpm audit --prod 2>&1 | grep -ci "next"` → the high-severity `next`
advisories from before (middleware bypass GHSA-6gpp-xcg3-4w24, SSRF) no longer
appear. (Other packages' advisories, e.g. dompurify via streamdown, may remain
— they are out of scope here.)

### Step 2: Run the full web gate

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Verify**: all three exit 0. `pnpm build` completes a production build with
no new errors or deprecation failures referencing `proxy.ts`.

### Step 3 (manual smoke, if a dev environment is available)

`pnpm dev`, load `http://localhost:3000` — the landing page renders with the
`vi` locale, and `/dashboard` still redirects unauthenticated users to sign-in
(this proves the Clerk+intl proxy chain still runs). If no dev env (no
`.env.local`), skip and note it in the report.

**Verify**: page loads; unauthenticated `/dashboard` does not render dashboard
content.

## Test plan

No new tests — `web` has no test runner (see plan 008). The gate is
typecheck + lint + build + the audit output.

## Done criteria

- [ ] `web/package.json` has `next` and `eslint-config-next` at `>=16.2.11 <16.3.0`
- [ ] `cd web && pnpm audit --prod` shows no remaining `next` advisories
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build` all exit 0
- [ ] `git status` shows only `web/package.json` and `web/pnpm-lock.yaml` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- No 16.2.x patch ≥ 16.2.11 exists on the registry (report the latest
  available and the advisory status).
- `pnpm install` fails on a peer-dependency conflict (e.g. `@clerk/nextjs`
  or `react 19.2.4` rejecting the new patch).
- `pnpm build` or `typecheck` surfaces errors in `web/proxy.ts` or any
  `app/` route after the bump — the patch should be behavior-compatible;
  code changes mean this needs human review.

## Maintenance notes

- Future Next bumps should re-run `pnpm audit --prod` as the acceptance check;
  the middleware/proxy layer is the sensitive surface in this app.
- Reviewer: confirm the diff is lockfile+manifest only.
- Deferred: the `streamdown → mermaid → dompurify` low-severity advisory and
  `sharp` (clears with Next image optimizer updates) — separate, lower priority.
