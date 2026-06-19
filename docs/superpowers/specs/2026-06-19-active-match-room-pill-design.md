# Active Match Room — Persistent Pill + Detail Sheet

**Date:** 2026-06-19
**Status:** Approved design, ready for implementation plan

## Goal

When the user has joined a match room, show a persistent indicator on **every**
dashboard page, with a way to open the room's details: location, participants,
and each participant's **trust score**.

## Decisions (from brainstorming)

- **Indicator:** a compact **pill in the topbar** (always visible, smallest
  footprint). Appears only when the user is in at least one room.
- **Detail surface:** a right **slide-over `Sheet`** (no new route, no page-level
  i18n). Opens from the pill.
- **Trust score:** a single `0–100` score per player with a **colored tier
  label** (Trusted / Reliable / New) and a star icon. New concept — added to the
  mock data.
- **Multi-room:** the pill represents the **most-recently-joined** room and shows
  a **`+N`** badge when the user is in several; the sheet lists the other joined
  rooms as **switchable rows**.
- **No "leave room" action** — matches the prototype's add-only model. The pill
  appears and updates; it is never dismissed by the user.

## What counts as "joining"

A room enters the joined set through the existing `MatchmakingProvider` paths,
all of which already mutate `joinedIds`:

- `joinRoom` — Join / Quick-Join from Match Maker.
- `addRoom` — Host a room (Create dialog) and Accept a found match.

All of these should also make their room the **active** room (most recent).

## Architecture

### 1. Data model — `components/dashboard/data.ts`

- Add `trust: number` (0–100) to the `Player` interface.
- Add a `trust` value to each of the 6 `MATCH_SUGGESTIONS` players and to
  `USER` (USER `NM` = 92). Values are static (server/client render parity).
- Add `playerByInitials(initials: string): { name: string; trust: number }`
  built from a roster of `MATCH_SUGGESTIONS` + `USER`. This resolves a room's
  `players: string[]` (bare initials) to names + trust. Unknown initials fall
  back to `{ name: initials, trust: <neutral default> }` so the UI never breaks.
- Add `trustTier(trust: number): "trusted" | "reliable" | "new"`
  - `>= 85` → `trusted`
  - `>= 70` → `reliable`
  - else → `new`
- Add a small accent map for tiers (e.g. trusted = brand/lime, reliable = chart
  color, new = muted) — colors chosen to fit the existing emerald/lime theme.

### 2. Provider — `components/dashboard/matchmaking.tsx`

Extend `MatchmakingProvider` / `MatchmakingContextValue`:

- New state `activeRoomId: string | null`.
- `joinRoom` and `addRoom` set `activeRoomId` to the joined/created room's id.
- Derived `joinedRooms: MatchRoom[]` — `rooms` filtered by `joinedIds`, ordered
  most-recent-first. (Track join order; a `joinedOrder: string[]` ref/state or a
  derivation that puts `activeRoomId` first is acceptable.)
- Derived `activeRoom: MatchRoom | null` — the room matching `activeRoomId`
  (fallback to first of `joinedRooms`).
- Expose via context: `joinedRooms`, `activeRoom`, `activeRoomId`,
  `setActiveRoomId`.

These are additive; existing consumers are unaffected.

### 3. New component — `components/dashboard/active-room.tsx` (`"use client"`)

A single cohesive component `ActiveRoomPill` that renders **both** the trigger
pill and the detail sheet (sheet open-state is local to this component; the
`Sheet` portals to `body`).

- Returns `null` when `joinedRooms` is empty.
- **Pill** (the `SheetTrigger`): compact rounded button — a green presence dot,
  label "In a match room", the active room's sport, and a `+N` badge when
  `joinedRooms.length > 1`. Styled to sit inline in the header.
- **Sheet** (`side="right"`):
  - **Header:** title (e.g. "Match room"); the active room's title/host.
  - **Location block:** venue · district · distance; day · time; sport · format;
    price/hour — reusing icons/format already used on `RoomCard`
    (`MapPin`, `Clock`, `formatVnd`).
  - **Participants (n):** one row per `activeRoom.players` initial →
    `playerByInitials`. Each row: `PlayerAvatar`, name (render `you` for the
    `USER.initials` row), skill-rating badge, and `★ {trust} · {tier label}`
    with the tier's accent color.
  - **Other rooms** (only when `joinedRooms.length > 1`): the remaining joined
    rooms as compact rows (sport, venue); tapping calls `setActiveRoomId(id)` to
    switch the sheet's content. The active room is excluded from this list.

### 4. Wiring — `components/dashboard/topbar.tsx`

Insert `<ActiveRoomPill />` into the header, before the notification bell. The
topbar already renders inside `MatchmakingProvider`, so `useMatchmaking()` is
available. No change to `app/[locale]/dashboard/layout.tsx`.

### 5. i18n — `messages/en.json` + `messages/vi.json`

New `ActiveRoom` namespace. Keys (final names may be refined in the plan):

- `pill` — "In a match room"
- `sheetTitle` — "Match room"
- `location` — "Location"
- `participants` — "Participants ({count})"
- `you` — "you"
- `trust.trusted` / `trust.reliable` / `trust.new` — "Trusted" / "Reliable" / "New"
- `otherRooms` — "Other rooms"
- `more` — "+{count}"
- `hostedBy` — reuse existing `MatchMaker.hostedBy` if suitable, else add.

Reuse `Common` for sport/format/when labels. Vietnamese strings use the formal
register consistent with the rest of the app.

## Components & responsibilities

| Unit | Does | Depends on |
| --- | --- | --- |
| `data.ts` additions | Holds trust data; resolves initials→player; classifies tier | none |
| `MatchmakingProvider` | Owns `activeRoomId` + derived joined/active rooms | `data.ts` |
| `ActiveRoomPill` | Renders pill + detail sheet; switches active room | `useMatchmaking`, `shared.tsx`, `ui/sheet`, i18n |
| `topbar.tsx` | Mounts the pill | `ActiveRoomPill` |

## Data flow

1. User joins/hosts/accepts a room → provider adds to `joinedIds` **and** sets
   `activeRoomId`.
2. `ActiveRoomPill` reads `joinedRooms`/`activeRoom` from context → renders the
   pill (with `+N` if multiple).
3. Click pill → sheet opens → renders active room's location + participants
   (each resolved via `playerByInitials` + `trustTier`).
4. (Multi-room) Click an "Other rooms" row → `setActiveRoomId` → sheet re-renders
   for that room.

## Edge cases

- **No joined rooms:** pill not rendered.
- **Unknown participant initials:** `playerByInitials` fallback keeps UI intact.
- **Active room equals only joined room:** no `+N`, no "Other rooms" section.
- **SSR parity:** all trust values are static constants; no `Date.now()`/random.

## Out of scope (YAGNI)

- No backend / persistence.
- No "leave room" / dismiss.
- No dedicated route page.
- No trust-score breakdown (matches played, punctuality, no-shows) — single
  score + tier only.

## Testing / verification

No test suite in this repo. Verify via:

- `pnpm typecheck` and `pnpm lint` pass.
- Manual: join a room → pill appears in topbar across all sections; open sheet →
  location + participants + trust visible; host/accept a second room → `+N`
  appears and switcher works; toggle `vi`/`en` → labels localized; toggle dark
  mode → tier colors legible.
