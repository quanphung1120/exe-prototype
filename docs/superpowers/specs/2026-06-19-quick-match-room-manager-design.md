# Quick Match fallback + Room manager — design

Date: 2026-06-19

Unify the two ways a hosted room comes into existence — **manual Room Creation**
and **Quick Match's fallback** — so both produce the same thing: an *open room
you manage*. Front-end-only prototype; all matchmaking is faked with timers and
static mock data.

## Problem

Today the two paths are lopsided:

- **Room Creation** (`CreateRoomDialog`) seeds an *open* room with **1** player
  (you) that others join from the lobby.
- **Quick Match fallback** (`quickJoin` → `startQueue` → `acceptMatch`) simulates
  filling an entire team, then hands you an **already-full** room of fake players
  with no way to invite anyone.

The fallback should instead gather a **minimum of 2** (you + one matched
partner), create a *real open room* at that moment, and drop you into a **room
manager** where you grow it. Manual and quick-match rooms then converge.

## Flow — Quick Match fallback (the changed path)

`quickJoin(filters)` still tries to **join** a fitting room first (unchanged).
When nothing fits, instead of queueing a full team:

1. **Searching** — the dock shows "Finding a partner…" (spinner + elapsed +
   Cancel). It now looks for your **first compatible partner**, not a full team.
2. **Found** (after ~1.8s, faked) — picks the best partner from
   `MATCH_SUGGESTIONS` (same sport preferred, highest `matchPct`, never the user;
   **always succeeds**) and shows a **"Found {name} 👋 · Room ready"** beat.
3. **Auto-create + drop in** — an open room is created immediately (no Accept
   step), the **manager sheet auto-opens**, and the dock switches to a persistent
   **"Room ready → Manage"** state (re-entry if you dismiss the sheet) with a
   dismiss (X).

Cancel during *searching* creates nothing. Dismiss during *ready* just closes
the dock (the room already exists).

## Smart defaults for the seed room

Derived from the Quick Join filters — no setup step:

| Field | Value |
|-------|-------|
| `sport` | filter sport (`"all"` → `badminton`) |
| `format` / `maxPlayers` | from Format filter: Doubles → 4, Singles → 2, Any → 4 |
| `capacity` | `maxPlayers`; **`joined: 2`**, `players: [USER.initials, partner]` |
| `venue`/court | nearest court whose `sports` include `sport` (by `distanceKm`) |
| `day` / `time` | `Today` · court's `nextSlot` → +1h |
| `skillMin/Max` | `skillWindow(filter.level, USER.rating)` |
| `host` / `title` | `USER` · the existing `matchmadeTitle` ("Matchmade {sport} {format}") |

Singles seeds **2/2** — a complete 1v1; that's correct, not a bug.

## Room manager — host-only controls in `RoomDetail`

A new **Host controls** section in the match-detail sheet
(`components/dashboard/active-room.tsx`), rendered only when
`room.host.initials === USER.initials` — so it applies to **manually-created
rooms too**, not just quick-match ones.

- **Max players** — a stepper (same primitive as the Create dialog). Range
  `[room.joined, 8]` (can't evict below current seats); updates `capacity` live.
- **Invite players** — a list of `MATCH_SUGGESTIONS` not already in
  `room.players`, sport-matched. Tap a player to add them directly (faked accept
  → takes a seat, `joined + 1`). The whole section is disabled when the room is
  full (`joined >= capacity`).

Existing read-only bits (location, participants, team chat, Leave) are unchanged.

## Public + direct join (no special-casing)

The seed room is added to the shared `rooms` list, so it appears in the Match
Maker lobby grid like any open room, and others **Join directly** — no approval
gate. Invite and lobby-Join are two doors into the same open room. The lobby card
for your seed room shows the "Joined → Leave" state (you host it), per existing
behaviour.

## Provider / API changes (`MatchmakingProvider`)

- **Replace** `startQueue` + `acceptMatch` with:
  - `startPartnerSearch(filters)` — sets a `search` state (`status:"searching"`,
    `elapsed`), starts the elapsed interval and a single ~1.8s timer whose
    callback picks a partner, calls `createSeedRoom`, and flips
    `search` to `status:"ready"` (carrying `partner` + `roomId`).
  - `createSeedRoom(filters, partner)` — builds the `MatchRoom` per *Smart
    defaults*, unshifts it into `rooms`, adds to `joinedIds`, sets
    `activeRoomId`, and calls `openManager(roomId)`.
  - `pickPartner(sport)` — `MATCH_SUGGESTIONS` filtered by sport (fallback: any),
    sorted by `matchPct` desc, excluding the user; returns one (always).
- **Rename** `cancelQueue` → `cancelSearch` (clears timers + `search`); add
  `dismissSearch()` for the *ready* state.
- **New host actions**:
  - `setRoomCapacity(roomId, n)` — clamp `n` to `[room.joined, 8]`, update
    `capacity`.
  - `invitePlayer(roomId, initials)` — if not full, append to `players`,
    `joined + 1`.
- **Auto-open**: `requestedManagerRoomId: string | null` + `openManager(id)` +
  `consumeManagerRequest()`. `ActiveRoomPill` runs an effect on
  `requestedManagerRoomId` → `setActiveRoomId(id)` + open the sheet + consume.
  The dock's **Manage** button also calls `openManager(roomId)`.
- `Queue` type → `PartnerSearch { sport, format, maxPlayers, elapsed, status:
  "searching" | "ready", partner?, roomId? }`.
- `leaveRoom` unchanged (hosted → delete, which also removes its derived team
  chat and any open manager).

## Dock changes (`MatchmakingDock`)

- **searching**: spinner + "Finding a partner…" + elapsed + Cancel (`cancelSearch`).
- **ready**: "Found {partner} 👋 · Room ready" + **Manage** (`openManager`) +
  dismiss X (`dismissSearch`). Persists until dismissed.

The old seat-progress dots are removed (no full-team simulation).

## i18n

New strings in `messages/en.json` + `messages/vi.json`:
`MatchMaker.dock.findingPartner`, `dock.found` (`{name}`), `dock.roomReady`,
`dock.manage`; `ActiveRoom.hostControls`, `ActiveRoom.maxPlayers`,
`ActiveRoom.invitePlayers`, `ActiveRoom.invite`, `ActiveRoom.roomFull`.

## Edge cases

- **Singles** → 2/2 full: invite list disabled, lobby shows "Full"; bump max to grow.
- Invite / lobby-join capped at `capacity`; stepper floor = current `joined`.
- Cancel during search → nothing created. Leaving a hosted seed room deletes it.

## Out of scope

- No join-approval/request queue (joins stay direct).
- Manual `CreateRoomDialog` is unchanged at creation time (it only gains the
  shared host controls in the manager, via the `RoomDetail` change above).
- No backend; state is in-memory and resets on full reload.

## Verification

No test suite (prototype). Browser-verify: a Quick Join with no fitting room →
"Finding a partner" → "Found {name}" → room created at 2/max → manager
auto-opens → invite a suggestion (seat fills) → adjust max → confirm the room
shows in the lobby and a non-host can Join it directly.
