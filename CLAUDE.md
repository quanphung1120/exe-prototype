# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SportMatch AI — a prototype for an AI-powered court-booking and player-matchmaking app for racquet sports (tennis, pickleball, cầu lông/badminton). Two surfaces:

- **Landing page** (`app/page.tsx`) — a marketing/waitlist site. All user-facing copy is **Vietnamese** (formal register, addressing the user as "Quý khách").
- **Dashboard** (`app/dashboard/`) — an interactive product demo. UI labels here are mostly English.

It is a **front-end-only prototype**: there is no backend or database. All data is static mock data and "live" behaviors (matchmaking, AI chat) are faked client-side with timers.

## Commands

```bash
pnpm dev         # dev server (Next.js)
pnpm build       # production build
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm format      # prettier --write on **/*.{ts,tsx}
```

Package manager is **pnpm**. There is no test suite.

## Next.js version warning (read before writing Next.js code)

This is **Next.js 16** (App Router, React 19) — newer than most training data, with breaking changes to APIs, conventions, and file structure. Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` (e.g. `01-app/`) before writing Next-specific code, and heed deprecation notices.

## Architecture

### Dashboard routing pattern
Each dashboard section is a route under `app/dashboard/<section>/page.tsx`. These page files are **thin server components**: they export `metadata` and render a matching view from `components/dashboard/views/`. The actual UI/logic lives in the view component (usually `"use client"`).

Navigation is centralized in `components/dashboard/nav.ts` (`NAV` array, `SectionKey` type, `isNavActive`/`activeNavItem` helpers). **To add a section:** create the route `page.tsx`, add the view in `views/`, and add a `NAV` entry — the sidebar and topbar derive from `NAV` automatically.

### Persistent dashboard state
`app/dashboard/layout.tsx` mounts providers around all dashboard pages so their state and timers **survive client-side navigation between sections**:
- `MatchmakingProvider` (`components/dashboard/matchmaking.tsx`) — owns the lobby list and matchmaking queue; consume via the `useMatchmaking()` hook. Includes the floating `MatchmakingDock`.
- `CourtAssistant` (`components/dashboard/court-assistant.tsx`) — a faked AI assistant chat with simulated "chain of thought" steps.

When adding behavior that must persist across navigation, hang it off these layout-level providers rather than per-page state.

### Mock data
All dashboard data lives in `components/dashboard/data.ts`. Values are **intentionally static so server and client renders stay in sync** (no `Date.now()`/random in render). Entity types: `Sport`, `Player`, `Court`, `MatchRoom`, `Booking`, `Chat`, `Message`, plus `USER`/`STREAK`/`STATS`/`ACTIVITY` constants and helpers (`sportLabel`, `sportAccent`, `formatVnd`, etc.). Reusable dashboard UI primitives (e.g. `SportDot`, `SportTag`, `CourtRow`) live in `components/dashboard/shared.tsx`.

### Theming and fonts
- **Tailwind v4, CSS-first.** There is no `tailwind.config`; the entire theme is defined in `app/globals.css` via `@theme inline` plus CSS custom properties (oklch colors). The palette is emerald/green (`primary`, `brand`, `chart-1..5`) with a `lime` accent.
- **Two font scopes.** The landing page uses Barlow (sans) + Barlow Condensed (headings). The dashboard is scoped to **Geist** via the `.font-geist` class applied on `SidebarProvider` in the dashboard layout (this rebinds `--font-sans`/`--font-heading`). Both share Geist Mono. All fonts are wired up in `app/layout.tsx`.
- **Dark mode** via `@teispace/next-themes` (an API-compatible `next-themes` fork; `class` attribute, system default). Pressing `l` (not while typing) toggles light/dark — see `ThemeHotkey` in `components/theme-provider.tsx`.

### UI components
shadcn/ui with the `base-luma` style (`components.json`). Note these are built on **`@base-ui/react`**, not Radix. Add components with `npx shadcn@latest add <name>`; an `@aceternity` registry is also configured. Primitives live in `components/ui/`.

## Conventions

- **Prettier** (`.prettierrc`): no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. The Tailwind plugin auto-sorts classes; `cn` and `cva` are registered as Tailwind functions, so put class strings in them.
- **Imports** use the `@/*` alias mapped to the repo root (`@/components`, `@/lib/utils`, `@/hooks`).
- Compose Tailwind classes with `cn()` from `lib/utils.ts`.
- Money is VND, formatted compactly with `formatVnd` (e.g. `180K`).
