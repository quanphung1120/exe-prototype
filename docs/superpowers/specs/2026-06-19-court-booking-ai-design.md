# Court booking + AI-assisted booking, integrated with Match Maker — design

Date: 2026-06-19

Add a real court-booking flow and wire the currently-dead "Book" buttons to it.
Booking is the **transactional commitment** that Match Maker has been missing: a
`MatchRoom` already carries players + a tentative venue/time, but nothing is ever
reserved. This design lets a host **book a court for a room** (carrying the room's
players into the booking) and lets anyone book a court directly (optionally
spinning up a room for the people they invite). Front-end-only; all behavior is
faked client-side and deterministic (no `Date.now()`/random in render).

## The loop

> Find partner / join room → room fills → **host books a court for the room** →
> booking lands in Bookings carrying the room's players (host "going", invitees
> "pending") → host can cancel (notifies players).

Direct path: **Play → Book a court** (or Book from a court card / AI
recommendation) → pick court, slot, format, and how to fill it (just the court /
invite players / find teammates) → booking appears in Bookings.

The AI assistant stays a *recommender*: it picks the court and its "Book" buttons
hand off to the same shared wizard. It does not auto-book.

## Play chooser (intent selector)

The user explicitly chooses what they want **before** any flow starts. A primary
**"Play"** action — in the topbar (always visible), the Overview hero, and as an
assistant suggestion chip — opens a small **intent chooser** `Dialog` with three
options:

- **Book a court** *(only booking)* → opens the booking wizard with **no court
  preselected** (starts at the Court step) and `fillMode: "court"`.
- **Find teammates** *(only find teammates)* → routes to Match Maker
  (`/dashboard/match-maker`); **no court is reserved**. The existing rooms / AI
  partner-search flow, unchanged.
- **Both** → opens the booking wizard (no court preselected) with
  `fillMode: "find"` — book a court *and* open it to teammates.

Intent only sets the wizard's launch defaults; the user can still switch fill
mode inside the wizard. "Find teammates" is the only branch that never books.

---

## 1. Data & slot model (`components/dashboard/data.ts`)

Courts have no per-slot data today. Add static, deterministic helpers:

- `SLOT_TIMES: string[]` — fixed hourly start times, e.g.
  `["17:00", "18:00", "19:00", "20:00", "21:00"]`. Each booking is a one-hour
  slot.
- `BOOKING_DAYS: { key: string; label: string }[]` — a fixed 5-entry strip:
  `today, tomorrow, sat, sun, mon` (English `label` is a fallback; localized via
  `Booking.days.<key>`). Static, like the existing `ROOM_TIME_SLOTS`.
- `slotRange(start: string): string` — `"18:00"` → `"18:00 – 19:00"` (export the
  one-hour helper that currently lives privately in `matchmaking.tsx` as
  `plusHour`, or duplicate a tiny pure version here; matchmaking can import it).
- `courtSlots(courtId: string, dayKey: string): { time: string; taken: boolean }[]`
  — **pure**. Returns one entry per `SLOT_TIMES`. `taken` is derived from a small
  deterministic hash of `courtId + dayKey + index`, with the number taken scaled
  by the court's `freePct` (lower `freePct` → more taken). Same inputs → same grid
  on every server/client render.
- `courtByVenue(name: string): Court | undefined` — resolve a room/booking venue
  name back to a `Court` (rooms store `venue` as a name).
- `dayKeyForRoom(room: MatchRoom): string` — map a room's stored `day`
  (`"Today"`/`"Tomorrow"`/…) to a `BOOKING_DAYS` key, defaulting to `"today"`.

Type changes:

```ts
export type InviteStatus = "host" | "going" | "pending"
export interface BookingPlayer {
  name: string
  initials: string
  status: InviteStatus
}
```

- `Booking.withPlayers` becomes `BookingPlayer[]`. Add `Booking.roomId?: string`
  and `Booking.pricePerHour: number`.
- `MatchRoom` gains `bookingId?: string`. A room with `bookingId` set is "booked".
- Update the existing `BOOKINGS` seed: give every `withPlayers` entry a `status`
  (the user is implied host; the rest `"going"`) and add `pricePerHour`
  (from `courtByVenue(venue)`, falling back to a sensible constant). The Bookings
  view degrades gracefully — extra fields don't break current rendering.

`COURTS` stays static: a confirmed booking does **not** mutate global court
availability. Within an open wizard session the just-picked slot flips to `taken`
in local state only.

## 2. `BookingProvider` (`components/dashboard/booking.tsx`)

A new layout-level provider, mounted **inside** `MatchmakingProvider` so it can
read rooms and call back into matchmaking. Mirrors the `MatchmakingProvider`
shape (focused, owns its timers/state). Consume via `useBooking()`.

State:

- `bookings: Booking[]` — seeded from `BOOKINGS`; the live source for the
  Bookings page.
- Play chooser: `playOpen: boolean`.
- Wizard state: `open`, `courtId: string | null`, `roomId: string | null`,
  `step` (the wizard advances through a dynamic list of steps, see §4), and a
  `draft`: `{ dayKey, slot: string | null, format: "Singles" | "Doubles",
  fillMode: "court" | "invite" | "find", invitees: string[] /* initials */ }`.

`fillMode` (type `FillMode = "court" | "invite" | "find"`, exported from
`booking.tsx`) is the single control for the booking↔teammates relationship:
`"court"` = booking only (no room), `"invite"` = book + create a **private** room
with the invited people, `"find"` = book + create an **open** room and fire the
faked partner search to fill its seats.

Actions:

- `openPlay()` / `closePlay()` — open/close the intent chooser.
- `openBooking(courtId: string | null, opts?: { roomId?: string; fillMode?: FillMode })`
  — opens the wizard. A `null` `courtId` starts at the **Court** step; otherwise
  it skips to **Slot**. With `roomId` (booking *for an existing room*): prefill
  `format` from the room, lock the roster to the room's members, default `dayKey`
  from `dayKeyForRoom(room)`, and skip the fill-mode choice (the room already
  exists). `opts.fillMode` seeds the default for court-less launches.
- `setStep` / `setDay` / `setSlot` / `setFormat` / `setCourt` / `setFillMode` /
  `toggleInvite`.
- `confirmBooking()` — build a `Booking` (status `"confirmed"`, host = `USER`
  status `"host"`, invitees status `"pending"`), prepend to `bookings`. Then, by
  context:
  - `roomId` set → matchmaking `attachBooking(roomId, id, { day, time, venue })`.
  - `fillMode === "invite"` → matchmaking `addRoom(...)` (private, the invitees as
    members) with `bookingId` linked; store its id on the booking's `roomId`.
  - `fillMode === "find"` → matchmaking `addRoom(...)` (open seats) with
    `bookingId` linked, then fire the faked partner search to auto-fill seats
    (see §3).
  - `fillMode === "court"` → no room.
  Toast success; close the wizard.
- `cancelBooking(id: string)` — host-only. Set status `"cancelled"`; if it has a
  `roomId`, call `detachBooking(roomId)`. Toast.

Derived: `userBookings` (all, for the page), `capacityFor(format)` (Singles 2 /
Doubles 4, including host).

The provider renders one global `<BookingDialog />` (the wizard, §4). Place it in
the layout next to `<MatchmakingDock />`, within `BookingProvider`'s scope.

## 3. Matchmaking integration (`components/dashboard/matchmaking.tsx` + `active-room.tsx`)

Add to `MatchmakingContextValue` and the provider:

- `attachBooking(roomId, bookingId, { day, time, venue })` — set the room's
  `bookingId` and sync its `day` / `time` / `venue` to the booking.
- `detachBooking(roomId)` — clear `bookingId`.
- `fillRoom(roomId)` — the booking wizard's **"find teammates"** path. Reuses the
  existing faked partner-search machinery (timers + the floating dock), but
  targets an *already-created* open room: after `SEARCH_MS` it auto-invites the
  best compatible player(s) (`pickPartner` → `invitePlayer`) until a seat fills,
  surfacing progress in the `MatchmakingDock` exactly like Quick Match does. This
  generalizes today's `startPartnerSearch` (which always seeds its own room) to
  also fill a given room.

In `active-room.tsx` `RoomDetail` (the room-manager Sheet), host-only:

- When `!room.bookingId`: a **"Book court"** button (in the Location section or
  the footer) → `openBooking(courtByVenue(room.venue)?.id, { roomId: room.id })`,
  falling back to the nearest court whose `sports` include the room's sport when
  the venue name isn't a known court.
- When `room.bookingId`: replace it with a **"Booked · {day} · {time}"** status
  chip plus a **"View in Bookings"** link (router push to `/dashboard/bookings`).
  Cancellation happens on the Bookings card (host-only), which calls
  `cancelBooking` → `detachBooking`, returning the room to the bookable state.

This is the only new surface on the matchmaking provider; it stays focused on
rooms.

## 4. The booking wizard (`BookingDialog` in `booking.tsx`)

One `Dialog` (centered modal, `sm:max-w-lg`, `max-h-[88vh] overflow-y-auto`),
matching the Quick Join / Create Room dialog conventions. The steps are
**dynamic**: a court-less launch (from the Play chooser / "New booking") runs
`Court · Slot · Players · Confirm` (4); a court-preselected launch (card /
assistant / room) runs `Slot · Players · Confirm` (3). The stepper header renders
whichever list applies; the chosen court shows in the dialog title once known.

- **Step — Court** *(only when `courtId` is null).* A searchable court list reusing
  the Quick Join pattern (`Search` input filtering `COURTS` by name/district, a
  bounded scroll list). Picking sets `courtId` (`setCourt`). Chooser launches
  carry no sport, so all courts show and the booking's sport is inferred from the
  court chosen here.
- **Step — Slot.** A row of day chips from `BOOKING_DAYS` (reusing the
  `FilterChips`/segmented-button pattern). Below, a slot grid (explicit
  `grid-cols-3` per the grid gotcha) of `courtSlots(courtId, dayKey)`: free slots
  are selectable buttons (`slotRange` label), taken slots are disabled/struck.
  Selecting highlights. **Next** disabled until a free slot is chosen.
- **Step — Players.** A Singles/Doubles toggle (locked to the room's format when
  `roomId` is set). Then:
  - When `roomId` is set (booking *for an existing room*): the room's members
    render as locked roster rows (status badges); no fill-mode choice.
  - Otherwise a **fill-mode** segmented control (defaulted by intent):
    **Just the court** (no teammates) · **Invite players** · **Find teammates**.
    - *Invite players* reveals the invite list from `MATCH_SUGGESTIONS`
      (same-sport first), each an Invite/Added toggle, capped at
      `capacityFor(format) - 1` (host holds one seat); controls disable at
      capacity. Switching Doubles→Singles trims/blocks excess invitees.
    - *Find teammates* shows a short line ("We'll open the remaining seats and
      find compatible players to fill them") — no manual invites.
  - **Back / Next.**
- **Step — Confirm.** Summary card: court, day + `slotRange`, sport · format,
  players line per fill mode ("Just you" / "2 going · 1 invited" / "Finding
  teammates…"), price (`formatVnd(pricePerHour)`/h) and a per-head split. If the
  chosen day/slot overlaps one of the user's existing `confirmed` bookings, show a
  warning line (still allowed — surfaces the conflict honestly).
  **Back / Confirm booking** → `confirmBooking()`.

Opening from the assistant leaves the assistant panel open; the modal overlay
sits above it.

## 5. Entry points

- **Play chooser** — a "Play" trigger in `topbar.tsx` (primary button), the
  Overview hero (`views/overview.tsx`), and a suggestion chip in
  `court-assistant.tsx`, all calling `openPlay()`. The chooser routes per §
  *Play chooser*.
- **`views/find-courts.tsx`** — `CourtCard` "Book" → `openBooking(court.id)`
  (court preselected, `fillMode: "court"`; the user can still switch mode).
- **`court-assistant.tsx`** — `ResultBlock` court rows' `RowAction` gets
  `onClick={() => openBooking(c.id)}` (`RowAction` already forwards props).
- **`active-room.tsx`** — host "Book court" / "Booked" status (§3); booking
  *for the existing room* (`roomId` set, no fill-mode choice).
- **`views/bookings.tsx`** — read `useBooking().userBookings` instead of the
  static import. "New booking" → `openPlay()` (the intent chooser). "Rebook"
  (past) → `openBooking(courtByVenue(b.venue)?.id, { fillMode: "court" })`
  prefilled (falls back to the Court step if the venue isn't a known court).
  "Manage" (upcoming, host-only) → a small confirm → `cancelBooking(b.id)`. Cards
  show the going/invited breakdown and a `cancelled` status badge.

## 6. Integrity & abuse / edge-case guards

No backend, so these are honest-modeling + UX guardrails, not real auth:

- **No faked consent.** Invitees are `status: "pending"` ("Invited"); only the
  (simulated) invitee side flips to "going". The host cannot mark others "going".
- **No overbooking.** Invites are hard-capped at `capacityFor(format)`; controls
  disable at capacity; switching Doubles→Singles blocks/trims excess invitees.
- **No double-booking.** `taken` slots are unselectable; the just-booked slot
  flips to taken for the session; a room with `bookingId` shows "Booked" /
  "Manage", never a second "Book court" (idempotent).
- **Self-conflict surfaced.** Overlap with the user's other confirmed bookings is
  flagged on the confirm step.
- **Host-only destructive actions.** Booking-for-a-room, cancel, and roster edits
  are gated on `room.host.initials === USER.initials` (mirrors the existing
  host-leaves-deletes rule). Members can leave; they cannot cancel the booking or
  edit the roster.
- **Confirmed = immutable** except cancel + rebook (rebook resets invitees to
  pending) — prevents silent court/time bait-and-switch after others commit.
- **Dedup / no self-invite.** `USER` is implicit and excluded from the invite
  list; invitees deduped by initials.
- **Right sport only.** Slot grids/pickers are limited to courts whose `sports`
  include the booking's sport.

## 7. i18n (`messages/en.json` + `messages/vi.json`)

New `Play` namespace (the intent chooser): `title` ("What do you want to do?"),
and `bookCourt` / `findTeammates` / `both` each with a `*Desc` subtitle, plus the
shared `play` button label.

New `Booking` namespace: dialog `title` (with `{court}`), step labels
(`court` / `slot` / `players` / `confirm`), `courtSearch` (reuse the Quick Join
phrasing), `days.<key>`, slot states (`free` / `taken`), `format` label, the
fill-mode control (`fillMode` label + `fill.court` / `fill.invite` / `fill.find`
options and `fill.findHint`), `invite` / `invited` / `added` / `going` / `host`,
summary labels (`when` / `players` / `price` / `perHead`) and the per-mode player
lines (`justYou` / `goingInvited` / `finding`), `conflictWarning`, `confirm`,
`newBooking`, `rebook`, and toasts (`toast.booked`, `toast.cancelled`). Add to
`ActiveRoom`: `bookCourt`, `booked` (with `{day}`/`{time}`), `viewInBookings`.
Add to `Bookings`: `cancel`, `goingInvited` (with `{going}`/`{invited}`), reusing
existing `manage` / `rebook` / `status.cancelled`. Add the `play` label to
`Topbar` + `Overview` as needed. Provide both `en` and `vi`. Reuse `Common`
(`format.*`, `sports.*`, `when.*`) wherever possible.

## 8. Out of scope

- Payments / charging players (per-head split is display-only).
- Mutating global `COURTS` availability after a booking.
- A real invite-acceptance flow (invitees stay "pending"; no accept UI).
- Editing a confirmed booking in place (cancel + rebook only).
- Any calendar beyond the fixed 5-day `BOOKING_DAYS` strip.
- New court data; slot grids are derived from existing `COURTS`.

## 9. Verification

No test suite. Run `pnpm lint` + `pnpm typecheck`, then browser-verify:

1. **Chooser routing:** "Play" → chooser. **Book a court** → wizard at the Court
   step → pick court → slot → "Just the court" → Confirm; booking shows in
   Bookings ("Just you"), no room created. **Find teammates** → lands on Match
   Maker, nothing booked. **Both** → wizard at Court step with "Find teammates"
   preselected.
2. **AI handoff:** open the assistant, ask for a court, click Book on a
   recommendation → the wizard opens for that court (skips the Court step).
3. **Invite mode:** Book a court → slot → "Invite players" → add two → Confirm →
   Bookings shows "1 going · 2 invited"; a linked private room appears in Match
   Maker.
4. **Both / find mode:** Both → court + slot → Confirm → booking created, an open
   room appears, and the dock runs the partner search and auto-fills a seat.
5. **Room → booking:** join/host a room → room manager → Book court → roster
   locked to room members, no fill-mode choice → Confirm → room shows "Booked ·
   …", booking carries the room's players, "Book court" is gone.
6. **Guards:** taken slots unselectable; invites stop at capacity; Doubles→Singles
   trims invitees; cancel a booking (host) → status `cancelled`, room returns to
   bookable; rebook prefills the court.
7. Check `en` + `vi`, light + dark.
