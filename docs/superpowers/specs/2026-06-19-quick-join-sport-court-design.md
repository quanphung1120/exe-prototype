# Quick Join: sport + court pickers — design

Date: 2026-06-19

Add a **Sport** and a **Court** picker to the Quick Join popover, so a quick
match can target a specific sport and venue instead of inheriting the lobby tab's
sport and auto-picking the nearest court.

## UI — two new controls atop the Quick Join popover

In `components/dashboard/views/match-maker.tsx` (`MatchMakerView`):

- **Sport** — `FilterChips`: *All · Badminton · Tennis*. New
  `quickSport` state (`SportKey | "all"`, default `"all"`).
- **Court** — a `Select`: *Any court* + courts whose `sports` include
  `quickSport` (when `quickSport === "all"`, all courts). New `quickCourt` state
  (`string`, default `"any"` = courtId or "any"). Sits under Sport; when
  `quickSport` changes and the chosen court no longer supports it, reset
  `quickCourt` to `"any"`.

These supersede the lobby **tab** as the sport source for Quick Match; the tab
stays a browse-only filter for the grid (`visibleRooms`). Distance/When/Format/
Level chips are unchanged.

## Filter data (`matchmaking.tsx`)

`QuickJoinFilters` gains `courtId: string | null`. `buildFilters()` returns
`sport: quickSport` and `courtId: quickCourt === "any" ? null : quickCourt`.

## Finding an existing room (`matchesQuickFilters`)

When `f.courtId` is set, the room must be at that venue:
`room.venue === COURTS.find(c => c.id === f.courtId)?.name`. The sport check uses
`f.sport` as today.

## Fallback seed room (`startPartnerSearch` / `createSeedRoom`)

`startPartnerSearch` resolves the seed sport and court:

- **sport**: `filters.sport !== "all"` → that sport; else if a court is chosen →
  the court's first supported sport; else `"badminton"`.
- **court**: `filters.courtId` → `COURTS.find(...)`; else `courtFor(sport)`
  (nearest, unchanged).

The resolved court is passed into `createSeedRoom` (new `opts.court: Court`) and
used for venue/district/distance/price/next-slot, replacing the internal
`courtFor` call.

## i18n (`messages/en.json` + `vi.json`)

`MatchMaker.quickFilter.sport` ("Sport"), `.court` ("Court"), `.anyCourt`
("Any court"). Sport chip labels reuse `Common.sports.*`.

## Out of scope

- The manual Create Room dialog already has its own sport + court fields;
  unchanged.
- No new court data; courts come from the existing `COURTS`.

## Verification

No test suite. Browser-verify: open Quick Join, pick Badminton → court list shows
only badminton-capable courts; pick a specific court → an existing room at that
venue is joined if one fits, otherwise the fallback seeds a room **at that
court**; "Any court" + a sport behaves as before; switching sport resets an
incompatible court.
