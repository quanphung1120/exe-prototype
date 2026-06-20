# SportMatch AI

A prototype for an AI-powered court-booking and player-matchmaking app for racquet
sports (tennis, pickleball, cầu lông/badminton). This is a **Turborepo monorepo**
managed with **pnpm**.

## Structure

```
apps/
  web/   # Next.js 16 frontend — landing page (Vietnamese) + product dashboard
  api/   # Hono server (Node) — zod-validated mock API, ready to grow a backend
packages/  # (empty) shared code lives here when web + api need it
```

## Getting started

```bash
pnpm install     # install the whole workspace
pnpm dev         # run every app's dev server (web :3000, api :3001)
```

## Common tasks

Run from the repo root; Turborepo fans each task out across the apps:

```bash
pnpm build       # production builds (next build + tsc)
pnpm lint        # eslint across all packages
pnpm typecheck   # tsc --noEmit across all packages
pnpm format      # prettier --write on **/*.{ts,tsx}
```

Target one app with a filter, e.g. `pnpm --filter api dev` or `pnpm --filter web build`.

## Adding shadcn/ui components

shadcn/ui (the `base-luma` style, built on `@base-ui/react`) lives in the web app:

```bash
cd apps/web && npx shadcn@latest add button
```

Components land in `apps/web/components/ui/` and are imported via the `@/*` alias.
