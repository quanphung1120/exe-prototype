# Quick Join filter — design

**Date:** 2026-06-19
**Surface:** Dashboard → Match Maker (`components/dashboard/views/match-maker.tsx`, `components/dashboard/matchmaking.tsx`)
**Status:** Approved for planning

## Problem

Today the **Quick Join** button auto-picks a room using only the current sport
tab plus the user's fixed ±skill window. The player can't say "only nearby,"
"today only," "doubles," or "find me stronger players." Quick Join is a black
box with one input.

## Goal

Give the player a small set of preferences that constrain what Quick Join
auto-picks — without changing the browsable room grid.

## Approach

A **popover anchored to the Quick Join button**. The button becomes a trigger
(`⚡ Quick join ▾`). Opening it reveals four filter rows as segmented chip
groups plus a primary **Find match** action. Pressing *Find match* runs the
filtered quick-join and closes the popover.

- Filters constrain **only** the Quick Join auto-pick. The room grid stays
  unfiltered.
- The sport still comes from the existing tab row; the popover layers on top.
- Filter state is **local to the Match Maker view**: it persists while the user
  stays on the page and resets on navigation. Acceptable for a prototype.

Rejected alternative: a split button (instant-run + chevron for filters). More
moving parts; the single popover keeps the controls and the action together.

## Filters and defaults

Defaults are permissive so untouched behavior ≈ today's behavior.

| Filter   | Options                            | Default              | Source field        |
| -------- | ---------------------------------- | -------------------- | ------------------- |
| Within   | ≤2km · ≤5km · Any                  | **Any**              | `room.distanceKm`   |
| When     | Today · Today + Tomorrow           | **Today + Tomorrow** | `room.day`          |
| Format   | Any · Singles · Doubles            | **Any**              | `room.format`       |
| Level    | My level (±0.3) · Any · Stronger   | **My level**         | `skillWindow(level)`|

The Level options reuse the existing `OPEN_TO` / `skillWindow` presets
(`my-level`, `any`, `above`) from `data.ts`.

## Selection logic

`quickJoin` is extended to take a filter object instead of a bare sport. From
all rooms, keep those that match **every** active constraint:

1. **Sport** — matches the sport tab (`all` or specific).
2. **Distance** — `room.distanceKm <= maxDistanceKm` (skip when "Any").
3. **Day** — when "Today", `room.day` is "Today"; when "Today + Tomorrow",
   `room.day` is "Today" or "Tomorrow".
4. **Format** — `room.format` matches (skip when "Any").
5. **Level** — the room's skill midpoint `(skillMin + skillMax) / 2` falls
   within `skillWindow(level, USER.rating)`.
6. **Joinable** — not full and not already joined (the current `isSuitable`
   minus its skill check).

Rank the survivors by the existing heuristic — closest skill midpoint to the
user, then nearest distance, then fullest — and join the best one.

**No-match fallback:** if nothing matches, fall back to the existing fake
matchmaking queue (`startQueue`) exactly as today, seeded with the chosen
sport (and format where relevant). Same toast as today.

### Level semantics change

Today the skill gate is "the user's rating sits inside the room's window"
(`USER.rating >= room.skillMin && USER.rating <= room.skillMax`). This design
switches to "the room's midpoint sits inside the user's chosen window" so the
three Level presets behave distinctly:

- **My level** → window `[rating-0.3, rating+0.3]`
- **Any** → window `[1, 7]` (matches everything)
- **Stronger** → window `[rating, rating+0.8]`

On the current mock data the "My level" result is nearly identical to today's.

## Code shape

### `components/dashboard/matchmaking.tsx`

- Add a `QuickJoinFilters` type:
  ```ts
  interface QuickJoinFilters {
    sport: SportKey | "all"
    maxDistanceKm: number | null   // null = Any
    day: "today" | "today-tomorrow"
    format: "Singles" | "Doubles" | "any"
    level: OpenToKey
  }
  ```
- Change the context method `quickJoin(sport)` → `quickJoin(filters)` and
  update `MatchmakingContextValue`.
- Add a `matchesQuickFilters(room, filters)` helper covering constraints 1–5
  (sport, distance, day, format, level).
- **Reduce `isSuitable` to the joinable check only** (constraint 6: not full and
  not already joined). Its current skill check moves into the Level branch of
  `matchesQuickFilters`. This is safe — `isSuitable` is exposed on the context
  but consumed nowhere except `quickJoin`.
- Selection becomes
  `rooms.filter((r) => isSuitable(r) && matchesQuickFilters(r, filters))`.
- Keep the existing ranking and the `startQueue` fallback. The fallback uses
  `filters.sport` (defaulting `"all"` → `"badminton"` as today) and the chosen
  format when set.

### `components/dashboard/views/match-maker.tsx`

- Add local filter state (the four fields above) with the defaults from the
  table.
- Replace the Quick Join `<Button onClick={() => quickJoin(sport)}>` with a
  `<Popover>` whose trigger is the styled `⚡ Quick join ▾` button and whose
  content holds the four segmented chip groups + a **Find match** button. Find
  calls `quickJoin({ sport, ...filters })` and closes the popover.
- The empty-state "Find me a match" button runs `quickJoin({ sport, ...filters })`
  in one click using current state.
- Use segmented chips (shadcn `ToggleGroup`, single-select) for each row, or a
  small inline button group if `ToggleGroup` is not present.

### Components and i18n

- Add the shadcn `popover` primitive: `npx shadcn@latest add popover` (and
  `toggle-group` if used). These build on `@base-ui/react`, already installed.
- Add `MatchMaker.quickFilter.*` strings to **both** `messages/en.json` and
  `messages/vi.json`: filter row labels, each option label, and the
  *Find match* button. Vietnamese copy follows the formal register used
  elsewhere.

## Out of scope (YAGNI)

- Persisting filters across navigation.
- A price filter or a custom distance slider.
- Multi-sport selection inside the popover.
- Filtering the browsable room grid (this design touches Quick Join only).

## Acceptance

- Opening Quick Join shows four filter rows with the documented defaults.
- Setting filters and pressing *Find match* joins a room satisfying all
  constraints, or queues a fake match when none qualify.
- The room grid is unaffected by the filters.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass; both locales have the
  new strings.
