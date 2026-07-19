# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SportMatch AI — a prototype for an AI-powered court-booking and player-matchmaking app for racquet sports (pickleball, cầu lông/badminton). The product is **Vietnamese-first**: Vietnamese is the primary language and target market, and all user-facing copy should default to Vietnamese (localized via next-intl — `web/messages/{en,vi}.json`, `web/i18n/`; English is the secondary locale). Two surfaces in the web app:

- **Landing page** (`web/app/[locale]/page.tsx`) — marketing/waitlist site. Copy is Vietnamese in a formal register, addressing the user as "Quý khách".
- **Dashboard** (`web/app/[locale]/dashboard/`) — the interactive product demo (player + venue-operator workspaces). Some UI labels are still English; new UI copy should be written in Vietnamese (or added to both message catalogs) rather than extending the English-only text.

`web` (Next.js 16 frontend) and `api` (NestJS server) are two **dedicated, standalone projects** — each has its own `package.json` and pnpm lockfile; there is no Turborepo, no pnpm workspace, no shared package. The small set of entity types/config/pure helpers both apps need is **hand-duplicated**: `web/lib/shared/` and `api/src/shared/` are separate copies kept in sync manually — when one side changes in a way the other depends on, update both. (Web's copy uses extensionless internal imports for Turbopack; api's copy uses `.js` extensions like the rest of `api`.)

Most dashboard data is **hardcoded seed** (`api/src/data/{player,venue}.ts`) served over HTTP, but parts are **MongoDB-backed** (Mongoose): venues/courts (seeded on first read, mutations persist) and a player's own sessions/bookings/assessment (keyed by Clerk `userId`). Live behaviors like matchmaking timers, AI chat, and payment are simulated client-side.

## Commands

Each app is a separate project — `cd` into it and run pnpm directly:

```bash
cd web && pnpm install && pnpm dev    # Next.js on :3000
cd api && pnpm install && pnpm dev    # NestJS on :6969 (nest start --watch --no-shell)
```

Within either app:

```bash
pnpm build       # production build
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
```

Only `api` has tests — Node's built-in runner via `tsx`:

```bash
cd api && pnpm test                                    # all tests (test/*.test.ts)
node --import tsx --test test/auth.test.ts             # a single test file
```

To run both apps together, use Docker Compose from the repo root: `docker compose up --build` (bind-mounts source for hot reload; `web` reaches `api` inside the compose network via `API_URL=http://api:6969`). There is no root `package.json` — each app owns its own Prettier config (`.prettierrc`/`.prettierignore`) and `pnpm format` script; run it from inside `api/` or `web/`.

**API dev caveat:** the api dev script must stay `nest start --watch --no-shell` — without `--no-shell`, watch-mode reloads leave the old server holding the port (EADDRINUSE), especially inside the `node:26-slim` container where `ps` is absent.

## Next.js version warning (read before writing Next.js code)

This is **Next.js 16** (App Router, React 19) — newer than most training data, with breaking changes to APIs, conventions, and file structure. Per `AGENTS.md`, read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next-specific code, and heed deprecation notices.

## Architecture

### api — NestJS

NestJS 11 on Express (native ESM — **relative imports must use `.js` extensions**). `src/main.ts` bootstraps: global `api` route prefix (except the open `GET /health` and `/health/ready` probes), CORS reflecting `WEB_URL`, body-size limits, shutdown hooks. `src/app.module.ts` wires everything:

- **Env validation** — `src/env.validation.ts` (zod) runs at boot via `ConfigModule.forRoot({ validate })`; a missing `DATABASE_URL`/`CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` crashes the process immediately. Read config via `ConfigService`, not raw `process.env`.
- **MongoDB** — `MongooseModule.forRootAsync` on `DATABASE_URL` (MongoDB Atlas). Feature schemas are `@nestjs/mongoose` classes in each feature folder.
- **Global providers, in order:** `ThrottlerGuard` (120 req/min per IP) → `ClerkAuthGuard` → `AllExceptionsFilter`.

**Features** live in `src/features/<feature>/` (`courts`, `players`, `sessions`, `assessment`, `venues`, `seed`, `health`), each with its `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (Mongoose) and, where a route takes input, `*.dto.ts` (class-validator DTOs). Some features have several of a kind (e.g. `players/{player,profile}.*`). Cross-cutting pieces are in `src/common/` (auth guard, exceptions filter, `@Public()` and `@UserId()` decorators, mongo-util). Seed records stay in `src/data/`.

**Error handling is centralized:** services/controllers **throw Nest `HttpException`s** (`NotFoundException`, `BadRequestException`, `ConflictException`, …) instead of returning sentinels; `AllExceptionsFilter` renders every failure as `{ error: message }` at its status (unknown throws → logged → 500). Validate request input with **class-validator DTO classes** (`*.dto.ts`), typed on the handler param (`@Body()`/`@Query()`/`@Param() dto: SomeDto`) and checked by the global `ValidationPipe` (`whitelist: true, transform: true`) wired in `main.ts`; a failure throws `BadRequestException` (message array joined by the filter) so misses flow through the same `{ error }` filter. Handler args typed as a plain interface/type (metatype `Object`, e.g. the raw PlaySession PUT body) are intentionally left unvalidated. (Env validation in `env.validation.ts` still uses zod — a separate boot-time concern.)

**Auth:** every route requires a valid Clerk session token (Bearer) or gets 401 — `ClerkAuthGuard` wraps `@clerk/express`'s `clerkMiddleware` + `getAuth`. Routes marked `@Public()` (health probes) skip it. The guard distinguishes caller-fault token errors (→ 401) from infrastructure failures like a missing secret or unreachable JWKS (→ 500). Data is shared demo data — the guard requires *a* signed-in user; only sessions/profile/assessment are scoped per `userId` (via the `@UserId()` decorator).

### web — Next.js, feature-based

Code is organized by **feature folders** under `web/features/` (imported as `@/features/<feature>/...`): `landing/` (marketing sections, GSAP scroll animations), `auth/` (Clerk forms), `dashboard/` (sidebar/topbar/nav, data provider, shared primitives), `play/` (matchmaking + court finder/map, the PlaySession store in `session.tsx`), `booking/` (wizard + calendar), `chat/` (AI chat home), `assessment/`, `venue/` (the whole operator surface at `/dashboard/venue/[venueId]/*`, with its own `venue-data-provider` and server actions in `venue-actions.ts`). Truly generic code stays outside features: `components/ui/` (shadcn primitives), `lib/` (`utils.ts`, `api.ts`, `auth-server.ts`), `hooks/`. Cross-feature imports (e.g. booking → play's session store) are fine.

**Routing pattern:** route files under `app/[locale]/dashboard/<section>/page.tsx` are thin server components — they export `metadata` and render a view from the feature folder (usually `"use client"`). Navigation is centralized in `features/dashboard/nav.ts` (`NAV` array) and `features/venue/nav.ts`; sidebar/topbar derive from it. To add a section: route `page.tsx` + feature view + `NAV` entry.

**Persistent dashboard state:** `dashboard/layout.tsx` mounts providers around all dashboard pages so state/timers survive client-side navigation — e.g. `MatchmakingProvider` (`features/play/matchmaking.tsx`, consumed via `useMatchmaking()`). Hang cross-navigation state off these layout-level providers, not per-page state.

**Data flow:** the dashboard layout is an async server component (`force-dynamic`) that calls `fetchSeed()` (`lib/api.ts`, server-only, `API_URL` default `http://localhost:6969`) and passes the aggregate `GET /api/seed` payload into `<DataProvider>`. Components read records and record-bound helpers via **`useData()`** — no client-side fetching or loading states. Seed values are intentionally static/deterministic so server and client renders match (no `Date.now()`/random in render). `features/dashboard/data.ts` and `features/venue/data.ts` are thin barrels re-exporting `@/lib/shared`. Every server-side fetch attaches the Clerk token via `authHeaders()` (`auth().getToken()` as `Authorization: Bearer`).

### Theming and fonts

- **Tailwind v4, CSS-first** — no `tailwind.config`; the theme lives in `app/globals.css` (`@theme inline` + oklch custom properties). Emerald/green palette with a lime accent.
- **Two font scopes:** landing uses Barlow + Barlow Condensed; the dashboard is scoped to Geist via `.font-geist` on the dashboard layout's `SidebarProvider` (rebinds `--font-sans`/`--font-heading`).
- **Dark mode** via `@teispace/next-themes` (next-themes fork, class attribute). Pressing `l` (not while typing) toggles the theme.
- **shadcn/ui** with the `base-luma` style, built on **`@base-ui/react`, not Radix**. Add with `cd web && npx shadcn@latest add <name>`.

## Conventions

- **Prettier** (`.prettierrc`): no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. The Tailwind plugin sorts classes; `cn`/`cva` are registered Tailwind functions, so put class strings in them.
- Web imports use the `@/*` alias (maps to `web/*`); compose Tailwind classes with `cn()` from `lib/utils.ts`.
- Money is VND, formatted compactly with `formatVnd` (e.g. `180K`).
- Repo eslint errors on synchronous `setState` inside effects — lift such UI state into the owning provider instead.
