# SportMatch AI

A prototype for an AI-powered court-booking and player-matchmaking app for racquet
sports (cầu lông/badminton). `web` and `api` are two
**dedicated, standalone projects** (own `package.json`, own pnpm lockfile) —
there is no Turborepo, no pnpm workspace, and no shared package linking them.

## Structure

```
apps/
  web/   # Next.js 16 frontend — landing page (Vietnamese) + product dashboard
  api/   # NestJS server (Node) — Mongoose-backed API
```

Each app owns a copy of the small set of entity types/config/helpers it needs
under `lib/shared` (web) / `src/shared` (api) — kept in sync by hand since the
two projects don't share a package.

## Getting started

Each app is installed and run independently:

```bash
cd web && pnpm install && pnpm dev   # :3000
cd api && pnpm install && pnpm dev   # :6969
```

Or bring both up together with Docker Compose from the repo root:

```bash
docker compose up --build
```

## Common tasks

Run from inside the app you're working on:

```bash
pnpm build       # production build
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
```

`pnpm format` runs prettier — run it inside `api/` or `web/`; each app owns its own Prettier config.

## Release checklist

See `RELEASE.md` for the pre-release checklist: environment variables
(including planned `SEPAY_*` for the SePay gateway), IPN tunnel + sandbox
test procedure, the reseed procedure, the full build/lint/typecheck/test
matrix, and Clerk test-mode E2E notes.

## Adding shadcn/ui components

shadcn/ui (the `base-luma` style, built on `@base-ui/react`) lives in the web app:

```bash
cd web && npx shadcn@latest add button
```

Components land in `web/components/ui/` and are imported via the `@/*` alias.
