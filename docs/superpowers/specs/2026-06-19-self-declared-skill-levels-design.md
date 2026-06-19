# Self-declared skill levels — design

Date: 2026-06-19

Replace the platform-computed numeric skill rating with three **self-declared
levels** — Beginner, Intermediate, Advanced. The platform is a centralizer: it
does not grade players; each player declares their own level. Front-end-only
prototype.

## Principles

- **Self-declared.** A player's level is a profile attribute they set, never
  computed or nudged by the platform.
- **No numeric rating.** The `4.12`-style rating and everything that "moved" it
  (activity feed, stats, hero copy, room skill windows) is removed.
- **Level is a preference, not a gate.** Rooms state a level; filters and the
  partner search respect it; but direct lobby joins stay open (a player may
  choose to "play up"). Nothing hard-blocks a join on level.

## Model (`components/dashboard/data.ts`)

- `type Level = "beginner" | "intermediate" | "advanced"`
- `type RoomLevel = Level | "any"`
- `LEVELS: { value: Level; accent: string }[]` — ordered B→I→A, each with a
  theme tint class for chips.
- Helpers: `levelLabel` (via i18n at call sites), `levelMatches(playerLevel,
  roomLevel) = roomLevel === "any" || roomLevel === playerLevel`.
- Field changes:
  - `USER`: drop `rating`, `ratingDelta`, `tier`; add `level: "intermediate"`.
  - `Player`: drop `rating`; add `level: Level`.
  - `RosterEntry`: `rating?` → `level: Level`.
  - `MatchRoom`: drop `skillMin`/`skillMax`; add `level: RoomLevel`.
  - Delete `OPEN_TO`, `OpenToKey`, `skillWindow`.
  - `STATS`: drop `rating`/`ratingDelta` (STATS is currently unused anywhere).
- **Re-seed for variety** so the demo exercises all three levels:
  - Players: Đỗ Anh → Beginner; Lê Lan, Bùi Khang → Intermediate; Trần Huy,
    Phạm Quân, Vũ Hà → Advanced. `USER` → Intermediate.
  - Rooms: spread across Beginner / Intermediate / Advanced, plus a couple of
    "Any" (e.g. r3 casual → Beginner, r4 advanced doubles → Advanced, r6 "all
    welcome" → Any, r1/r5 → Intermediate, r2 competitive → Advanced).

## Dynamic user level (the live picker)

- The user's level becomes **state in `MatchmakingProvider`**: `userLevel: Level`
  + `setUserLevel(level)` (initial `"intermediate"`). Matchmaking already needs
  to read it, so it owns it.
- A **level selector** in the sidebar profile dropdown
  (`components/dashboard/app-sidebar.tsx`) replaces the static "city · tier"
  line — a `DropdownMenuRadioGroup` of the three levels. Switching it
  immediately re-filters the lobby's "my level" results, the Quick Join "my
  level" option, the Create dialog default, the hero copy, and who the partner
  search picks.

## Rooms & joining (`views/match-maker.tsx`)

- **Card badge**: the `3.8–4.4` skill range → a single **level chip**
  ("Intermediate" / "Any level"), tinted via the level's accent.
- **Create Room**: the "Open to" `Select` becomes a **Level** select with four
  options — Beginner / Intermediate / Advanced / Any — defaulting to your
  current `userLevel`. The created room stores `level`.
- **Join stays open** — no level gate on the card's Join button.

## Filters & matchmaking (`matchmaking.tsx`)

- `QuickJoinFilters.level: "my" | "any" | Level` (was `OpenToKey`). The Quick
  Join **Level** filter chips: **My level · Any · Beginner · Intermediate ·
  Advanced** (kept specific-level options per request).
- `matchesQuickFilters`: resolve the target (`"my"` → `userLevel`); `"any"` →
  no constraint; otherwise pass when `levelMatches(target, room.level)`
  (so `"any"` rooms always qualify, and a specific filter matches that level +
  "any" rooms).
- Partner search: the seed room's `level` = the host's `userLevel`;
  `pickPartner(sport, userLevel)` prefers a same-level, then same-sport player,
  with `matchPct` as the tiebreak.

## Participants (`active-room.tsx`)

`ParticipantRow` shows each player's **level chip** instead of the numeric
rating badge. The host-controls invite list already keys off players; it shows
their level too.

## Removing the "grading"

- Hero copy (`MatchMaker.heroBody`): "Lobbies around your **4.12** rating" →
  "Open rooms for **{level}** players near you" (interpolates the live level).
- **Delete** the "Your skill rating rose to 4.12" activity item (`ACTIVITY` a2)
  and notification (`NOTIFICATIONS` n4) — the platform no longer moves a number.
  Leave the `ActivityKind`/`NotificationKind` "rating" union members in place
  (harmless; other code switches on them).

## i18n (`messages/en.json` + `vi.json`)

- Add `Common.levels.{beginner,intermediate,advanced}` and a `level.any`
  ("Any level").
- `MatchMaker.dialog.openTo` label → "Level"; `MatchMaker.quickFilter.level`
  chip labels (myLevel/any + the three levels); reworked `heroBody`.
- `Sidebar` (or `ActiveRoom`) strings for the profile level picker
  ("Your level").
- Remove now-unused `openTo.*` numeric-window strings and the rating activity
  strings.

## Out of scope

- No persistence — `userLevel` resets on full reload.
- No skill verification/history; level is purely self-declared and mutable.
- Court `rating` (venue quality) and player `trust` (reliability) are unrelated
  and untouched.

## Verification

No test suite. Browser-verify: switch your level in the sidebar → lobby "my
level" results and the Create-dialog default change; a room chip shows its
level; Quick Join with a specific level finds matching rooms; the fallback
seeds a room at your current level with a same-level partner; hero copy and
participant chips read levels; no `4.12` appears anywhere.
