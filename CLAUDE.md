# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SportMatch AI — a prototype for an AI-powered court-booking and player-matchmaking app for racquet sports (pickleball, cầu lông/badminton). Two surfaces:

- **Landing page** (`apps/web/app/[locale]/page.tsx`) — a marketing/waitlist site. All user-facing copy is **Vietnamese** (formal register, addressing the user as "Quý khách").
- **Dashboard** (`apps/web/app/[locale]/dashboard/`) — an interactive product demo. UI labels here are mostly English.

This is a **Turborepo monorepo** (pnpm workspaces) with two apps — **`apps/web`** (the Next.js frontend — the surfaces above) and **`apps/api`** (a Hono server) — plus a shared **`packages/shared`** (`@repo/shared`). Most dashboard data is still **hardcoded seed** (players, courts, chats, streak, venue analytics/insights), served over HTTP so the web app fetches it server-side. But the app is **partly DB-backed now** (MongoDB via Mongoose, `src/lib/db.ts`, on `DATABASE_URL`; Mongoose models live inside each feature folder): the **venue service** (`src/features/venues/service.ts`) persists to Mongo — it seeds the collection from the hardcoded `INITIAL_VENUES` on first read, then every venue/court/walk-in mutation survives restart — and a player's **own bookings & rooms** persist per Clerk user (`src/features/sessions/`, `/api/sessions`), merged over the demo sessions in the seed. The rest of the "live" behaviors (matchmaking timers, AI chat, faked payment) are still simulated client-side. See **Dashboard data flow** and **API auth** below.

## Commands

Run from the repo root — **Turborepo** fans each task out across `apps/web` + `apps/api`:

```bash
pnpm dev         # dev servers (Next.js on :3000, Hono on :6969)
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
- **`apps/api`** — a Hono server on `@hono/node-server` (Node, native ESM via `NodeNext`). The **app definition** (middleware chain + route tree, exports `routes`/`AppType`) lives in `src/app.ts`, free of side effects so tests can drive it via `routes.request(...)`; `src/index.ts` is the **bootstrap** (Mongo connect, `serve`, graceful shutdown). Middleware order: `logger` → `cors` on `/api/*` → **Clerk auth guard** (see **API auth**) → routes → `onError`/`notFound`. The API is **feature-based**: each resource lives in `src/features/<feature>/` (`courts`, `players`, `sessions`, `venues`, `seed`) containing its `route.ts` (Hono router, mounted with `app.route(...)` in `app.ts`), `controller.ts`, `service.ts` and Mongoose `model.ts` (some features have several, e.g. `players/{player,profile}-{service,model}.ts`, `venues/{venue,venues}-{route,controller}.ts`). Cross-cutting pieces live in `src/lib/` (`db.ts`, `errors.ts`, `validate.ts`, `mongo-util.ts`, `context.ts`); the **hardcoded seed records** stay in `src/data/*.ts` (shared across features). Services are **MongoDB-backed** where persistent (async, `await connectDb()` lazily): `features/venues/service.ts` (operator venue/court/reservation CRUD, seeded on first read from `INITIAL_VENUES`) and `features/sessions/service.ts` (a player's persisted PlaySessions, keyed by Clerk `userId` via `getAuth`; `buildSeed(venueId, userId)` merges them over the demo sessions, and `/api/sessions` GET/PUT/DELETE is the write path). Handlers are **chained** so the exported `AppType` carries full RPC types for a future typed client. **Error handling is centralized**: services/controllers **throw domain errors** from `src/lib/errors.ts` (`AppError` base + `BadRequest`/`Validation`/`Unauthorized`/`NotFound`/`Conflict`, each carrying an HTTP status) instead of returning `undefined`/tagged sentinels or translating to HTTP by hand — `app.onError` maps any `AppError` to `{ error: message }` at its status (unknown throws → logged → 500). Input is validated with zod v4 via the shared **`validate()`** wrapper (`src/lib/validate.ts`) — use it in routes in place of the raw `@hono/zod-validator` `zValidator` so a schema miss throws `ValidationError` and flows through `onError` in the same `{ error }` shape. **Relative imports must use `.js` extensions** (NodeNext requirement), e.g. `import { courts } from "./features/courts/route.js"`. `pnpm build` uses `tsconfig.build.json` (src only → `dist`); `tsconfig.json` is noEmit and also covers `test/`. Tests are Node's built-in runner via `tsx` (`pnpm --filter api test`).
- **`packages/shared`** (`@repo/shared`) — the entity **types**, UI **config** (sport catalog, level/accent maps, slot grids) and pure **helpers** both apps share. It is a **compiled** internal package (`tsc` → `dist`, `exports` point at `dist`), so `dev`/`build` depend on `^build` (Turborepo builds it first). Helpers that need records take them as parameters (e.g. `courtByVenue(courts, name)`, `conflictFor(courts, user, sessions, q)`, `buildSeedSessions(...)`); the web binds these to the fetched data.

Shared code that both apps need belongs in `packages/shared` (or a new `packages/*` workspace), not inside an app. **All paths in the sections below are under `apps/web/`** (e.g. `features/dashboard/data.ts` = `apps/web/features/dashboard/data.ts`).

### Feature-based web structure
The web app is organized by **feature folders** under `apps/web/features/` (imported as `@/features/<feature>/...`):
- `landing/` — marketing page sections, GSAP scroll components (`scroll/`, `gsap.ts`, `reveal.tsx`).
- `auth/` — Clerk sign-in/up/reset forms.
- `dashboard/` — the player dashboard shell + cross-section pieces: `app-sidebar`, `topbar`, `nav.ts`, `data-provider`, `data.ts` barrel, `shared.tsx` primitives, notifications, profile dialog, workspace switching.
- `play/` — matchmaking + court finding: `play`/`match-maker`/`find-courts` views, `matchmaking.tsx`, `session.tsx` (the PlaySession store), court map, `player-matching.ts`, `session-actions.ts`.
- `booking/` — booking wizard + bookings calendar: `book`/`bookings` views, `booking.tsx` provider, `calendar.ts`/`calendar-ui.tsx`.
- `chat/` — the AI chat home (`ai-native-dashboard`, `chat` view, `chat-store`).
- `assessment/` — skills assessment view, gate, `player-assessment.ts`.
- `venue/` — the whole operator surface: venue views (analytics, schedule, manage, …), `venue-data-provider`, `venue-provider`, `nav.ts`, `data.ts` barrel, `venue-actions.ts` server actions.

Truly generic code stays outside features: `components/ui/` (shadcn primitives), `components/` (logo, theme), `lib/` (`utils.ts`, `api.ts`, `auth-server.ts`), `hooks/`. Route files under `app/` stay thin and render feature views. New code for a section belongs in its feature folder; cross-feature imports (e.g. booking → play's session store) are fine.

### Dashboard routing pattern
Each dashboard section is a route under `app/dashboard/<section>/page.tsx`. These page files are **thin server components**: they export `metadata` and render a matching view from the section's feature folder. The actual UI/logic lives in the view component (usually `"use client"`).

Navigation is centralized in `features/dashboard/nav.ts` (`NAV` array, `SectionKey` type, `isNavActive`/`activeNavItem` helpers). **To add a section:** create the route `page.tsx`, add the view in its feature folder, and add a `NAV` entry — the sidebar and topbar derive from `NAV` automatically.

### Persistent dashboard state
`app/dashboard/layout.tsx` mounts providers around all dashboard pages so their state and timers **survive client-side navigation between sections** — e.g. `MatchmakingProvider` (`features/play/matchmaking.tsx`), which owns the lobby list and matchmaking queue; consume via the `useMatchmaking()` hook. Includes the floating `MatchmakingDock`.

When adding behavior that must persist across navigation, hang it off these layout-level providers rather than per-page state.

### Dashboard data flow (data loaded from the API)
The dashboard data is still hardcoded, but it is **served by the Hono API and fetched by the web app** — it is no longer imported as a local web module. Values are **intentionally static/deterministic so server and client renders stay in sync** (no `Date.now()`/random in render).

- **Records** live in `apps/api/src/data/{player,venue}.ts` (`COURTS`, `MATCH_SUGGESTIONS`, `BOOKINGS`, `CHATS`, `VENUE_*`, …) and the derived `SESSIONS` seed (built via `buildSeedSessions`). The API exposes them as a single aggregate at **`GET /api/seed`** (plus per-resource routes like `/api/courts`, `/api/players`, `/api/venue/*`).
- **Types, config & pure helpers** live in `@repo/shared` (`Sport`, `Player`, `Court`, `Booking`, …, plus `sportLabel`, `formatVnd`, `slotRange`, accent maps, etc.).
- **Web side:** `app/[locale]/dashboard/layout.tsx` is an `async` server component (`export const dynamic = "force-dynamic"`) that calls `fetchSeed()` (`lib/api.ts`, server-only, reads `API_URL`, defaults to `http://localhost:6969`) and passes the seed into `<DataProvider>` (`features/dashboard/data-provider.tsx`). Components read records and **record-bound helpers** (with their original signatures) via the **`useData()`** hook — e.g. `const { courts: COURTS, playerByInitials } = useData()`. There is **no client-side fetching or loading state**.
- `features/dashboard/data.ts` and `features/venue/data.ts` are thin **barrels** that re-export `@repo/shared` (so existing type/config/pure-helper imports keep working); they do not export records.

Reusable dashboard UI primitives (e.g. `SportDot`, `SportTag`, `CourtRow`) live in `features/dashboard/shared.tsx`.

### API auth (Clerk)
The Hono API is **guarded by Clerk** — every `/api/*` request must carry a valid Clerk session token or it gets **401**. It uses `@clerk/hono`'s `clerkMiddleware()` + `getAuth(c)?.userId` (the documented pattern) in `src/app.ts`, backed by `@clerk/backend`; the API's `.env` needs `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (same values as the web app). The guard runs `clerkMiddleware` with a no-op `next` and wraps both it **and** the `getAuth` read in one try/catch, so a missing, plain-invalid, **or corrupt (JWT-shaped-but-undecodable)** token all resolve to a clean 401 instead of a 500. Data is **shared demo data** — the guard requires *a* signed-in user but does **not** scope rows per user. `/health` is left open; CORS preflight (`OPTIONS`) is short-circuited by `cors()` before the guard.

The **web forwards the token**: `lib/api.ts` exports `authHeaders()` (`auth().getToken()` from `@clerk/nextjs/server`) and every server-side fetch (`fetchSeed`/`fetchVenues`/`fetchVenueBundle` in `lib/api.ts`, the `api()` helper in `features/venue/venue-actions.ts`) attaches it as `Authorization: Bearer <token>`. These all run in Clerk-middleware-matched server contexts (dashboard layout, pages, server actions, `/api/chat`), so `auth()` is available.

### Theming and fonts
- **Tailwind v4, CSS-first.** There is no `tailwind.config`; the entire theme is defined in `app/globals.css` via `@theme inline` plus CSS custom properties (oklch colors). The palette is emerald/green (`primary`, `brand`, `chart-1..5`) with a `lime` accent.
- **Two font scopes.** The landing page uses Barlow (sans) + Barlow Condensed (headings). The dashboard is scoped to **Geist** via the `.font-geist` class applied on `SidebarProvider` in the dashboard layout (this rebinds `--font-sans`/`--font-heading`). Both share Geist Mono. All fonts are wired up in `app/layout.tsx`.
- **Dark mode** via `@teispace/next-themes` (an API-compatible `next-themes` fork; `class` attribute, system default). Pressing `l` (not while typing) toggles light/dark — see `ThemeHotkey` in `components/theme-provider.tsx`.

### UI components
shadcn/ui with the `base-luma` style (`components.json`). Note these are built on **`@base-ui/react`**, not Radix. Add components with `npx shadcn@latest add <name>`; an `@aceternity` registry is also configured. Primitives live in `components/ui/`.

## Conventions

- **Prettier** (`.prettierrc`): no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. The Tailwind plugin auto-sorts classes; `cn` and `cva` are registered as Tailwind functions, so put class strings in them.
- **Imports** in `apps/web` use the `@/*` alias mapped to the web package root, i.e. `apps/web/*` (`@/features`, `@/components/ui`, `@/lib/utils`, `@/hooks`).
- Compose Tailwind classes with `cn()` from `lib/utils.ts`.
- Money is VND, formatted compactly with `formatVnd` (e.g. `180K`).
