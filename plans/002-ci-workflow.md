# Plan 002: Add a GitHub Actions CI gate for both apps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- api/package.json web/package.json RELEASE.md`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but run after plans/001 so CI is green from its first run)
- **Category**: dx
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

There is no `.github/` directory — zero CI. The release gate documented in
`RELEASE.md` §4 (typecheck/lint/test/build for both apps) is run entirely by
hand. The api's `node --test` suite is the only automated guard on the
money-path logic (bookings state machine, SePay IPN, refund math) and nothing
runs it on push; it can silently break. One workflow file closes this.

## Current state

- Repo layout: two standalone pnpm projects, `api/` and `web/`, each with its
  own `package.json` and `pnpm-lock.yaml`. **No root `package.json`** and no
  root lockfile. Each app also has its own `pnpm-workspace.yaml` (single-app;
  the Dockerfiles COPY it — leave those files alone).
- Neither `package.json` has a `packageManager` field. Docker images use
  `node:26-slim`.
- Scripts (identical names in both apps): `typecheck` (`tsc --noEmit`),
  `lint` (`eslint`), `build`. Only api has `test`
  (`node --import tsx --test test/*.test.ts`). From `RELEASE.md:161-192`:

```bash
# api: pnpm typecheck / lint / test / build
# web: pnpm typecheck / lint / build   (web has no automated tests today)
```

- The api's env validation (`api/src/env.validation.ts`, zod) only runs at
  **server boot**, not at build — `pnpm build`/`test` in api need no env vars
  (tests fake all external clients; see `api/test/payments-service.test.ts`).
- `web` `next build` may require `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build
  time (Clerk components in the layout). Verify in step 2 and use a dummy
  publishable key env if the build demands one.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| api gate | `cd api && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |
| web gate | `cd web && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build` | all exit 0 |
| Validate YAML | `node -e "require('js-yaml')"` is NOT available — rely on `actionlint` if installed, else visual check + push |

## Scope

**In scope** (the only files you should create/modify):
- `.github/workflows/ci.yml` (create)

**Out of scope**:
- `api/Dockerfile*`, `web/Dockerfile`, `docker-compose.yml` — CI does not
  build images in this plan.
- Adding a `packageManager` field or corepack config to the apps' manifests —
  keep the manifests untouched; pin pnpm in the workflow instead.
- Pre-commit hooks (husky/lint-staged) — deliberately deferred.

## Git workflow

- Branch: `advisor/002-ci-workflow`
- One commit, e.g. `Add GitHub Actions CI for api and web`.
- Do NOT push or open a PR unless the operator instructed it. (Note: CI can
  only be observed running after a push — say so in your report.)

## Steps

### Step 1: Run both gates locally first

Run the two gate commands from "Commands you will need" locally so you know
the expected baseline. If either fails locally *before* your change, STOP —
the repo is red and the workflow would just codify a failure.

**Verify**: both command chains exit 0.

### Step 2: Determine web build env needs

```bash
cd web && rm -rf .next && NEXT_TELEMETRY_DISABLED=1 pnpm build
```

If the build fails with a missing-Clerk-key (or other missing env) error,
re-run with a dummy value:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA pnpm build`
and record which env vars the workflow must set. If a dummy key doesn't
satisfy it, STOP and report the exact error.

**Verify**: `pnpm build` exits 0 (with or without the dummy env), and you have
the definitive env list for the workflow.

### Step 3: Write `.github/workflows/ci.yml`

Create the workflow with two independent jobs (api and web), triggered on
`push` to `master` and on `pull_request`. Shape:

```yaml
name: CI
on:
  push:
    branches: [master]
  pull_request:

jobs:
  api:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: api } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: pnpm
          cache-dependency-path: api/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
  web:
    # same shape, working-directory: web, cache-dependency-path: web/pnpm-lock.yaml
    # steps: install → typecheck → lint → build (no test script exists)
    # env: add the vars discovered in Step 2 on the build step, e.g.
    #   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA
```

Adjust the pnpm major (`version: 10`) if `pnpm --version` locally reports a
different major — match local, since the lockfiles were written by it. If
node 26 is unavailable on the runner image, drop to the newest available
even-numbered release and note it.

**Verify**: `cat .github/workflows/ci.yml` matches the shape above;
if `actionlint` is installed, `actionlint` → no errors.

### Step 4: Commit

**Verify**: `git status` → only `.github/workflows/ci.yml` added.

## Test plan

The workflow itself is the test; it can only fully verify after a push.
Local proxy: Step 1's two command chains are exactly what the jobs run.

## Done criteria

- [ ] `.github/workflows/ci.yml` exists with an `api` job (install/typecheck/lint/test/build) and a `web` job (install/typecheck/lint/build)
- [ ] Both gates pass locally with `--frozen-lockfile`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated (note "unverified on GitHub until pushed" if not pushed)

## STOP conditions

- Either gate fails locally before your change (repo is already red).
- `pnpm install --frozen-lockfile` fails (lockfile out of sync with manifest).
- Web build requires a *real* secret (not satisfiable by a dummy publishable
  key) — report which var.

## Maintenance notes

- When plan 008 adds a web test runner, add `pnpm test` to the web job.
- A future improvement: a third job diffing `web/lib/shared/` vs
  `api/src/shared/` (modulo `.js` import extensions) to catch drift in the
  hand-duplicated shared code — deferred, the copies are currently identical.
- Reviewer: check the pnpm major matches the lockfile format and that
  `cache-dependency-path` points at each app's own lockfile.
