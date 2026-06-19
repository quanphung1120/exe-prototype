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

Direct path: browse Find Courts (or ask the AI assistant) → **Book** → pick slot,
format, invite players → optionally create a room → booking appears in Bookings.

The AI assistant stays a *recommender*: it picks the court and its "Book" buttons
hand off to the same shared wizard. It does not auto-book.

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
- Wizard state: `open`, `courtId`, `roomId: string | null`, `step: 1 | 2 | 3`,
  and a `draft`: `{ dayKey, slot: string | null, format: "Singles" | "Doubles",
  invitees: string[] /* initials */, createRoom: boolean }`.

Actions:

- `openBooking(courtId: string, opts?: { roomId?: string })` — opens at step 1.
  With `roomId`, prefill `format` and `invitees` from the room's roster, lock the
  roster to the room's members, and default `dayKey` from `dayKeyForRoom(room)`.
- `setStep` / `setDay` / `setSlot` / `setFormat` / `toggleInvite` / `setCreateRoom`.
- `confirmBooking()` — build a `Booking` (status `"confirmed"`, host = `USER`
  status `"host"`, invitees status `"pending"`), prepend to `bookings`. If
  `roomId`, call matchmaking `attachBooking(roomId, id, { day, time, venue })`.
  If `draft.createRoom` (and no `roomId`), call matchmaking `addRoom(...)` with
  the chosen court/slot and `bookingId` linked. Toast success; close the wizard.
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
matching the Quick Join / Create Room dialog conventions. A stepper header shows
`● ─ ● ─ ○  Slot · Players · Confirm`. The court is **fixed** (chosen by the card
/ assistant / room) and shown in the dialog title; it is not picked in the wizard.

- **Step 1 — Slot.** A row of day chips from `BOOKING_DAYS` (reusing the
  `FilterChips`/segmented-button pattern). Below, a slot grid (explicit
  `grid-cols-3` per the grid gotcha) of `courtSlots(courtId, dayKey)`: free slots
  are selectable buttons (`slotRange` label), taken slots are disabled/struck.
  Selecting highlights. **Next** is disabled until a free slot is chosen.
- **Step 2 — Players.** A Singles/Doubles toggle (locked to the room's format
  when `roomId` is set). An invite list from `MATCH_SUGGESTIONS` (same-sport
  first), each with an Invite/Added toggle; capped at `capacityFor(format) - 1`
  (host occupies one seat) — controls disable at capacity. When `roomId` is set,
  the room's existing members render as locked roster rows (status badges) and
  count against capacity. A **"Create a match room for these players"** checkbox
  (`createRoom`, default off, hidden when `roomId` is set) — the booking→room
  direction. **Back / Next.**
- **Step 3 — Confirm.** Summary card: court, day + `slotRange`, sport · format,
  players (e.g. "2 going · 1 invited"), price (`formatVnd(pricePerHour)`/h) and a
  per-head split. If the chosen day/slot overlaps one of the user's existing
  `confirmed` bookings, show a warning line above the button (still allowed — it
  surfaces the conflict honestly). **Back / Confirm booking** → `confirmBooking()`.

Opening from the assistant leaves the assistant panel open; the modal overlay
sits above it.

## 5. Entry points

- **`views/find-courts.tsx`** — `CourtCard` "Book" button → `openBooking(court.id)`.
- **`court-assistant.tsx`** — the `ResultBlock` court rows' `RowAction` gets
  `onClick={() => openBooking(c.id)}` (`RowAction` already forwards props).
- **`active-room.tsx`** — host "Book court" / "Booked" status (§3).
- **`views/bookings.tsx`** — read `useBooking().userBookings` instead of the
  static import. "New booking" → route to `/dashboard/find-courts` (browse → book).
  "Rebook" (past) → `openBooking(courtByVenue(b.venue)?.id, …)` prefilled (falls
  back to Find Courts if the venue isn't a known court). "Manage" (upcoming,
  host-only) → a small confirm → `cancelBooking(b.id)`. Cards show the
  going/invited breakdown and a `cancelled` status badge.

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

New `Booking` namespace: dialog `title` (with `{court}`), step labels
(`slot` / `players` / `confirm`), `days.<key>`, slot states (`free` / `taken`),
`format` label, `invite` / `invited` / `added` / `going` / `host`, `createRoom`,
summary labels (`when` / `players` / `price` / `perHead`), `conflictWarning`,
`confirm`, `newBooking`, `rebook`, and toasts (`toast.booked`,
`toast.cancelled`). Add to `ActiveRoom`: `bookCourt`, `booked` (with
`{day}`/`{time}`), `viewInBookings`. Add to `Bookings`: `cancel`,
`goingInvited` (with `{going}`/`{invited}`), and reuse existing `manage` /
`rebook` / `status.cancelled`. Provide both `en` and `vi`. Reuse `Common`
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

1. **Direct book:** Find Courts → Book → pick a day + free slot → pick Doubles,
   invite two players → Confirm → toast; the booking shows in Bookings with
   "1 going · 2 invited" and the right court/time.
2. **AI handoff:** open the assistant, ask for a court, click Book on a
   recommendation → the same wizard opens for that court.
3. **Room → booking:** join/host a room → open the room manager → Book court →
   slot prefilled context, roster locked to room members → Confirm → room shows
   "Booked · …"; the booking carries the room's players; "Book court" is gone.
4. **Booking → room:** direct book with "Create a match room" on → a new room
   appears in Match Maker linked to the booking.
5. **Guards:** taken slots unselectable; invites stop at capacity; switching to
   Singles trims invitees; cancel a booking (host) → status `cancelled`, room
   returns to bookable; rebook prefills the court.
6. Check `en` + `vi`, light + dark.
