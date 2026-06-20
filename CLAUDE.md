# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SportMatch AI — a prototype for an AI-powered court-booking and player-matchmaking app for racquet sports (tennis, pickleball, cầu lông/badminton). Two surfaces:

- **Landing page** (`apps/web/app/[locale]/page.tsx`) — a marketing/waitlist site. All user-facing copy is **Vietnamese** (formal register, addressing the user as "Quý khách").
- **Dashboard** (`apps/web/app/[locale]/dashboard/`) — an interactive product demo. UI labels here are mostly English.

This is a **Turborepo monorepo** (pnpm workspaces) with two apps — **`apps/web`** (the Next.js frontend — the surfaces above) and **`apps/api`** (a Hono server) — plus a shared **`packages/shared`** (`@repo/shared`). There is still **no real database**: the dashboard data is **hardcoded**, but it now lives in **`apps/api`** and is **served over HTTP** (the web app fetches it server-side rather than importing a local module). "Live" behaviors (matchmaking, AI chat, the venue monitor) are still faked client-side with timers. See **Dashboard data flow** below.

## Commands

Run from the repo root — **Turborepo** fans each task out across `apps/web` + `apps/api`:

```bash
pnpm dev         # dev servers (Next.js on :3000, Hono on :3001)
pnpm build       # production builds (next build + tsc)
pnpm lint        # eslint across all packages
pnpm typecheck   # tsc --noEmit across all packages
pnpm format      # prettier --write on **/*.{ts,tsx} (root-level tooling)
```

Target a single package with a filter:

```bash
pnpm --filter web dev      # just the Next.js app
pnpm --filter api dev      # just the Hono API (tsx watch)
```

Package manager is **pnpm** (workspaces); the build system is **Turborepo** (`turbo.json`). The root `package.json` carries only repo tooling and **delegates every script to `turbo run`** — don't put build/lint logic there. There is no test suite.

## Next.js version warning (read before writing Next.js code)

This is **Next.js 16** (App Router, React 19) — newer than most training data, with breaking changes to APIs, conventions, and file structure. Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` (e.g. `01-app/`) before writing Next-specific code, and heed deprecation notices.

## Architecture

### Monorepo & Turborepo
The repo is a pnpm-workspace monorepo (`pnpm-workspace.yaml` globs `apps/*`, `packages/*`) driven by Turborepo (`turbo.json`). Two apps + one shared package:
- **`apps/web`** — the Next.js 16 frontend. Self-contained: it owns its `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`, `tsconfig.json`, `proxy.ts`, `i18n/`, `messages/`, `public/`. `next.config.ts` sets `outputFileTracingRoot` to the monorepo root so production builds trace correctly from `apps/web`.
- **`apps/api`** — a Hono server on `@hono/node-server` (Node, native ESM via `NodeNext`). Entry is `src/index.ts` (app bootstrap, `logger`, `cors` on `/api/*`, `onError`/`notFound`, graceful shutdown); the **hardcoded records** live in `src/data/*.ts` and resource routers in `src/routes/*.ts`, mounted with `app.route(...)`. Handlers are **chained** so the exported `AppType` carries full RPC types for a future typed client. Input is validated with `@hono/zod-validator` + zod v4. **Relative imports must use `.js` extensions** (NodeNext requirement), e.g. `import { courts } from "./routes/courts.js"`.
- **`packages/shared`** (`@repo/shared`) — the entity **types**, UI **config** (sport catalog, level/accent maps, slot grids) and pure **helpers** both apps share. It is a **compiled** internal package (`tsc` → `dist`, `exports` point at `dist`), so `dev`/`build` depend on `^build` (Turborepo builds it first). Helpers that need records take them as parameters (e.g. `courtByVenue(courts, name)`, `conflictFor(courts, user, sessions, q)`, `buildSeedSessions(...)`); the web binds these to the fetched data.

Shared code that both apps need belongs in `packages/shared` (or a new `packages/*` workspace), not inside an app. **All paths in the sections below are under `apps/web/`** (e.g. `components/dashboard/data.ts` = `apps/web/components/dashboard/data.ts`).

### Dashboard routing pattern
Each dashboard section is a route under `app/dashboard/<section>/page.tsx`. These page files are **thin server components**: they export `metadata` and render a matching view from `components/dashboard/views/`. The actual UI/logic lives in the view component (usually `"use client"`).

Navigation is centralized in `components/dashboard/nav.ts` (`NAV` array, `SectionKey` type, `isNavActive`/`activeNavItem` helpers). **To add a section:** create the route `page.tsx`, add the view in `views/`, and add a `NAV` entry — the sidebar and topbar derive from `NAV` automatically.

### Persistent dashboard state
`app/dashboard/layout.tsx` mounts providers around all dashboard pages so their state and timers **survive client-side navigation between sections**:
- `MatchmakingProvider` (`components/dashboard/matchmaking.tsx`) — owns the lobby list and matchmaking queue; consume via the `useMatchmaking()` hook. Includes the floating `MatchmakingDock`.
- `CourtAssistant` (`components/dashboard/court-assistant.tsx`) — a faked AI assistant chat with simulated "chain of thought" steps.

When adding behavior that must persist across navigation, hang it off these layout-level providers rather than per-page state.

### Dashboard data flow (data loaded from the API)
The dashboard data is still hardcoded, but it is **served by the Hono API and fetched by the web app** — it is no longer imported as a local web module. Values are **intentionally static/deterministic so server and client renders stay in sync** (no `Date.now()`/random in render).

- **Records** live in `apps/api/src/data/{player,venue}.ts` (`COURTS`, `MATCH_SUGGESTIONS`, `BOOKINGS`, `CHATS`, `VENUE_*`, …) and the derived `SESSIONS` seed (built via `buildSeedSessions`). The API exposes them as a single aggregate at **`GET /api/seed`** (plus per-resource routes like `/api/courts`, `/api/players`, `/api/venue/*`).
- **Types, config & pure helpers** live in `@repo/shared` (`Sport`, `Player`, `Court`, `Booking`, …, plus `sportLabel`, `formatVnd`, `slotRange`, accent maps, etc.).
- **Web side:** `app/[locale]/dashboard/layout.tsx` is an `async` server component (`export const dynamic = "force-dynamic"`) that calls `fetchSeed()` (`lib/api.ts`, server-only, reads `API_URL`, defaults to `http://localhost:3001`) and passes the seed into `<DataProvider>` (`components/dashboard/data-provider.tsx`). Components read records and **record-bound helpers** (with their original signatures) via the **`useData()`** hook — e.g. `const { courts: COURTS, playerByInitials } = useData()`. There is **no client-side fetching or loading state**.
- `components/dashboard/data.ts` and `components/dashboard/venue/data.ts` are now thin **barrels** that re-export `@repo/shared` (so existing type/config/pure-helper imports keep working); they no longer export records.

Reusable dashboard UI primitives (e.g. `SportDot`, `SportTag`, `CourtRow`) live in `components/dashboard/shared.tsx`.

### Theming and fonts
- **Tailwind v4, CSS-first.** There is no `tailwind.config`; the entire theme is defined in `app/globals.css` via `@theme inline` plus CSS custom properties (oklch colors). The palette is emerald/green (`primary`, `brand`, `chart-1..5`) with a `lime` accent.
- **Two font scopes.** The landing page uses Barlow (sans) + Barlow Condensed (headings). The dashboard is scoped to **Geist** via the `.font-geist` class applied on `SidebarProvider` in the dashboard layout (this rebinds `--font-sans`/`--font-heading`). Both share Geist Mono. All fonts are wired up in `app/layout.tsx`.
- **Dark mode** via `@teispace/next-themes` (an API-compatible `next-themes` fork; `class` attribute, system default). Pressing `l` (not while typing) toggles light/dark — see `ThemeHotkey` in `components/theme-provider.tsx`.

### UI components
shadcn/ui with the `base-luma` style (`components.json`). Note these are built on **`@base-ui/react`**, not Radix. Add components with `npx shadcn@latest add <name>`; an `@aceternity` registry is also configured. Primitives live in `components/ui/`.

## Conventions

- **Prettier** (`.prettierrc`): no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. The Tailwind plugin auto-sorts classes; `cn` and `cva` are registered as Tailwind functions, so put class strings in them.
- **Imports** in `apps/web` use the `@/*` alias mapped to the web package root, i.e. `apps/web/*` (`@/components`, `@/lib/utils`, `@/hooks`).
- Compose Tailwind classes with `cn()` from `lib/utils.ts`.
- Money is VND, formatted compactly with `formatVnd` (e.g. `180K`).
