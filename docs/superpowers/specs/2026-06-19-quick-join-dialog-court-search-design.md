# Quick Join → Dialog with searchable court list — design

Date: 2026-06-19

Move the Quick Join filter UI from a Popover into a modal **Dialog**, and replace
the Court `Select` with a **search input + scrollable list** so users can find a
court by name or district. Front-end-only; no matchmaking changes.

## Container: Popover → Dialog

In `components/dashboard/views/match-maker.tsx` (`MatchMakerView`):

- Replace the Quick Join `Popover`/`PopoverTrigger`/`PopoverContent` with
  `Dialog`/`DialogTrigger`/`DialogContent` (already imported for the Create
  dialog). Keep the controlled `quickOpen`/`setQuickOpen` state and the same
  "Quick join" trigger button (Zap + label + chevron).
- `DialogContent` ≈ `sm:max-w-md`, `max-h-[88vh] overflow-y-auto`; a
  `DialogHeader` (title = `quickJoin`, description = new
  `quickFilter.description`), the filter stack, and a `DialogFooter` with the
  **Find match** button.
- Remove the now-unused `Popover*` imports.

## Filters (unchanged controls)

Sport chips · **Court (searchable)** · Distance · When · Format · Level — same
`FilterChips` as today, except the Court control.

## Court picker (the searchable part)

New local state `courtQuery: string` (default `""`).

- A search `Input` with a leading `Search` icon; placeholder
  `quickFilter.courtSearch`. Filters the sport-narrowed `quickCourts` by
  `name` **or** `district` (case-insensitive `includes`).
- A bounded scroll list (`max-h-44 overflow-y-auto`, rounded, subtle border):
  - First row: **Any court** (`quickCourt === "any"` highlighted).
  - Then each filtered court as a row button showing **"Name · District"**,
    highlighted when selected; clicking sets `quickCourt = c.id`.
  - When the filter yields nothing: a muted `quickFilter.noCourts` line.
- Switching sport still narrows `quickCourts` and resets an incompatible
  `quickCourt` to `"any"` (existing `onQuickSportChange`). Leave `courtQuery` as
  typed.

Row selection styling reuses the existing chat/list hover pattern
(`bg-secondary` when active, `hover:bg-muted/60` otherwise).

## Behavior

`Find match` calls the existing `runQuickJoin()` → `quickJoin(buildFilters())`
and closes the dialog. `QuickJoinFilters`, `matchesQuickFilters`, and the
fallback are **unchanged** — `courtId` still comes from `quickCourt`.

## i18n (`messages/en.json` + `vi.json`)

Add `MatchMaker.quickFilter.courtSearch` ("Search court name or district…"),
`quickFilter.noCourts` ("No courts found"), and `quickFilter.description`
("Set your filters and we'll find the best match."). Existing labels reused;
`quickFilter.court` stays the section label.

## Out of scope

- The Create Room dialog's court `Select` is unchanged.
- No new court data; the search is over existing `COURTS` (`name` + `district`).
- No `cmdk`/Command component — a plain Input + filtered list.

## Verification

No test suite. Browser-verify: the "Quick join" button opens a modal; typing
"đống" / "smash" narrows the court list; picking a court highlights it and feeds
the search/fallback (room seeds at that court); switching sport narrows the list
and clears an incompatible pick; a no-match query shows "No courts found";
"Find match" closes the dialog and runs the match. Check en + vi.
