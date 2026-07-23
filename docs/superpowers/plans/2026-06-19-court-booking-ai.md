# Court Booking + AI-Assisted Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real court-booking flow (slot wizard) wired to the dead "Book" buttons, plus a top-level "Play" intent chooser (book / find teammates / both), integrated with Match Maker so a room can be booked and a booking can spawn a room.

**Architecture:** A layout-level `BookingProvider` (mirroring `MatchmakingProvider`) owns the live bookings list and a multi-step booking dialog. It is mounted **inside** `MatchmakingProvider` so it can read rooms and call new `attachBooking`/`detachBooking`/`fillRoom` matchmaking actions. All data is static/deterministic (no `Date.now()`/random in render).

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind v4, `@base-ui/react` shadcn components, `next-intl`, `framer-motion`, `sonner`, `lucide-react`, `pnpm`.

## Global Constraints

- **No test suite.** Per-task gate is `pnpm typecheck` **and** `pnpm lint` passing, plus the manual browser check stated in the task. (`pnpm dev` to run the app.)
- **Prettier:** no semicolons, double quotes, 2-space indent, es5 trailing commas, 80-col. Class strings go inside `cn(...)`.
- **Imports:** use the `@/*` alias. Compose classes with `cn()` from `@/lib/utils`.
- **SSR sync:** no `Date.now()`/`Math.random()` in render or in module-level mock data; booking slots are derived from a deterministic string hash.
- **i18n:** every user-facing string is a `next-intl` key present in **both** `messages/en.json` and `messages/vi.json`. Dashboard copy is English; `vi.json` holds Vietnamese.
- **Grids:** dashboard grids must set an explicit `grid-cols-1` (or `grid-cols-N`) base — never rely on implicit single-column.
- **Money:** VND via `formatVnd` (compact "180K").
- **Commits:** small and frequent; one per task minimum. Co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `components/dashboard/booking.tsx` — `BookingProvider`, `useBooking`, `FillMode` type, all booking/chooser state + actions. ~230 lines.
- `components/dashboard/booking-dialog.tsx` — `<BookingDialog />` wizard (Court/Slot/Players/Confirm steps). ~280 lines.
- `components/dashboard/play-chooser.tsx` — `<PlayChooser />` intent dialog. ~90 lines.

**Modify:**
- `components/dashboard/data.ts` — slot model + helpers + `Booking`/`MatchRoom`/`BookingPlayer` types + `BOOKINGS` seed.
- `components/dashboard/matchmaking.tsx` — `attachBooking`/`detachBooking`/`fillRoom`.
- `app/[locale]/dashboard/layout.tsx` — mount `BookingProvider` + render `<PlayChooser />` + `<BookingDialog />`.
- `components/dashboard/views/find-courts.tsx` — wire `CourtCard` Book.
- `components/dashboard/views/bookings.tsx` — read live list; New booking / Rebook / Manage / going-invited.
- `components/dashboard/topbar.tsx` — "Play" button.
- `components/dashboard/views/overview.tsx` — Play CTA + court-row Book.
- `components/dashboard/court-assistant.tsx` — Play chip + recommendation Book.
- `components/dashboard/active-room.tsx` — host "Book court" / "Booked" status.
- `messages/en.json` + `messages/vi.json` — `Play` + `Booking` namespaces, `ActiveRoom`/`Bookings` additions.

---

## Task 1: Data foundation — slot model, types, seed

**Files:**
- Modify: `components/dashboard/data.ts`

**Interfaces:**
- Produces: `SLOT_TIMES: string[]`; `BOOKING_DAYS: { key: string; label: string }[]`; `slotRange(start: string): string`; `courtSlots(courtId: string, dayKey: string): { time: string; taken: boolean }[]`; `courtByVenue(name: string): Court | undefined`; `dayKeyForRoom(room: MatchRoom): string`; `type InviteStatus = "host" | "going" | "pending"`; `interface BookingPlayer { name: string; initials: string; status: InviteStatus }`; extended `Booking` (now `withPlayers: BookingPlayer[]`, plus `dayKey?: string`, `roomId?: string`, `pricePerHour: number`); `MatchRoom.bookingId?: string`.

- [ ] **Step 1: Add the slot model + helpers.**

Insert this block in `components/dashboard/data.ts` immediately **after** the `BOOKINGS` array (so `COURTS`, `MatchRoom`, and `Court` are already defined above it):

```ts
// ── Court booking: slot model + helpers ──────────────────────────────────────

/** Fixed hourly start times offered when booking a court. One-hour slots. */
export const SLOT_TIMES = ["17:00", "18:00", "19:00", "20:00", "21:00"]

/** The booking date strip: a fixed 5-day window (static so SSR stays in sync). */
export const BOOKING_DAYS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
]

/** Add one hour to a "HH:MM" start, returning "HH:MM – HH:MM". */
export function slotRange(start: string): string {
  const [h, m] = start.split(":").map(Number)
  const end = `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}`
  return `${start} – ${end}`
}

/** Tiny deterministic FNV-1a-style hash; stable across server and client. */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic per-court, per-day slot availability. No randomness/Date — the
 * same court + day always yields the same grid, so server and client agree.
 * Lower court `freePct` → more slots taken.
 */
export function courtSlots(
  courtId: string,
  dayKey: string
): { time: string; taken: boolean }[] {
  const freePct = COURTS.find((c) => c.id === courtId)?.freePct ?? 50
  return SLOT_TIMES.map((time, i) => ({
    time,
    taken: hashStr(`${courtId}:${dayKey}:${i}`) % 100 >= freePct,
  }))
}

/** Resolve a stored venue name back to a Court. */
export function courtByVenue(name: string): Court | undefined {
  return COURTS.find((c) => c.name === name)
}

/** Map a room's stored day word to a BOOKING_DAYS key (defaults to today). */
export function dayKeyForRoom(room: MatchRoom): string {
  const d = room.day.toLowerCase()
  if (d === "tomorrow") return "tomorrow"
  return "today"
}
```

- [ ] **Step 2: Extend the `Booking` types.**

Replace the existing `Booking` interface (currently around `export interface Booking { … }`) with:

```ts
export type InviteStatus = "host" | "going" | "pending"

export interface BookingPlayer {
  name: string
  initials: string
  status: InviteStatus
}

export interface Booking {
  id: string
  sport: SportKey
  format: "Singles" | "Doubles"
  venue: string
  court: string
  day: string
  /** BOOKING_DAYS key for new bookings; absent on legacy seed records. */
  dayKey?: string
  time: string
  status: BookingStatus
  withPlayers: BookingPlayer[]
  /** Linked match room, when the booking created or belongs to one. */
  roomId?: string
  pricePerHour: number
  result?: "W" | "L"
  score?: string
}
```

- [ ] **Step 3: Add `bookingId` to `MatchRoom`.**

In the `MatchRoom` interface add the field (after `pricePerHour`):

```ts
  pricePerHour: number
  /** Set once a court has been booked for this room. */
  bookingId?: string
```

- [ ] **Step 4: Update the `BOOKINGS` seed** so every `withPlayers` entry has a `status` and each booking has a `pricePerHour`. Replace the whole `BOOKINGS` array with:

```ts
export const BOOKINGS: Booking[] = [
  {
    id: "b1",
    sport: "badminton",
    format: "Doubles",
    venue: "Shuttle Republic",
    court: "Court 3",
    day: "Today",
    time: "18:30 – 19:30",
    status: "confirmed",
    pricePerHour: 360000,
    withPlayers: [
      { name: "Trần Huy", initials: "TH", status: "going" },
      { name: "Lê Lan", initials: "LL", status: "going" },
    ],
  },
  {
    id: "b2",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    court: "Court 1",
    day: "Tomorrow",
    time: "07:00 – 08:00",
    status: "confirmed",
    pricePerHour: 220000,
    withPlayers: [{ name: "Phạm Quân", initials: "PQ", status: "going" }],
  },
  {
    id: "b3",
    sport: "badminton",
    format: "Doubles",
    venue: "Smash Badminton",
    court: "Court 2",
    day: "Sat, 21 Jun",
    time: "09:30 – 10:30",
    status: "pending",
    pricePerHour: 150000,
    withPlayers: [
      { name: "Đỗ Anh", initials: "ĐA", status: "going" },
      { name: "Vũ Hà", initials: "VH", status: "going" },
    ],
  },
  {
    id: "b4",
    sport: "tennis",
    format: "Doubles",
    venue: "Rally Point Club",
    court: "Court 5",
    day: "Mon, 16 Jun",
    time: "20:00 – 21:00",
    status: "completed",
    pricePerHour: 280000,
    withPlayers: [
      { name: "Bùi Khang", initials: "BK", status: "going" },
      { name: "Lê Lan", initials: "LL", status: "going" },
    ],
    result: "W",
    score: "6–3, 6–4",
  },
  {
    id: "b5",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    court: "Court 2",
    day: "Fri, 13 Jun",
    time: "18:00 – 19:00",
    status: "completed",
    pricePerHour: 220000,
    withPlayers: [{ name: "Vũ Hà", initials: "VH", status: "going" }],
    result: "L",
    score: "4–6, 6–7",
  },
]
```

- [ ] **Step 5: Verify.**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (no type errors; `data.ts` only — consumers still compile because added fields are optional or already supplied).

- [ ] **Step 6: Commit.**

```bash
git add components/dashboard/data.ts
git commit -m "feat(data): court slot model, booking player status, seed prices

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Matchmaking integration hooks

**Files:**
- Modify: `components/dashboard/matchmaking.tsx`

**Interfaces:**
- Consumes (Task 1): nothing new; uses existing `pickPartner`, `invitePlayer`, `SEARCH_MS`, `userLevel`, `rooms`, timer refs.
- Produces: on `useMatchmaking()` → `attachBooking(roomId: string, bookingId: string, info: { day: string; time: string; venue: string }): void`; `detachBooking(roomId: string): void`; `fillRoom(room: MatchRoom): void`.

- [ ] **Step 1: Add the three methods to the interface.** In `interface MatchmakingContextValue`, after `invitePlayer`, add:

```ts
  /** Link a booking to a room and sync its day/time/venue. */
  attachBooking: (
    roomId: string,
    bookingId: string,
    info: { day: string; time: string; venue: string }
  ) => void
  /** Clear a room's booking link. */
  detachBooking: (roomId: string) => void
  /** Run the faked partner search to fill an already-created open room. */
  fillRoom: (room: MatchRoom) => void
```

- [ ] **Step 2: Implement the methods** in `MatchmakingProvider`, immediately after the existing `invitePlayer` definition:

```ts
  const attachBooking = (
    roomId: string,
    bookingId: string,
    info: { day: string; time: string; venue: string }
  ) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              bookingId,
              day: info.day,
              time: info.time,
              venue: info.venue,
            }
          : r
      )
    )
  }

  const detachBooking = (roomId: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, bookingId: undefined } : r))
    )
  }

  /**
   * Like startPartnerSearch, but fills an already-created room. Takes the room
   * object directly — `addRoom`'s state write hasn't flushed when this is called
   * from the booking flow, so reading it back from `rooms` would miss it.
   */
  const fillRoom = (room: MatchRoom) => {
    stopTimers()
    setSearch({
      sport: room.sport,
      format: room.format,
      maxPlayers: room.capacity,
      elapsed: 0,
      status: "searching",
      partner: null,
      roomId: room.id,
    })
    clock.current = setInterval(() => {
      setSearch((s) =>
        s && s.status === "searching" ? { ...s, elapsed: s.elapsed + 1 } : s
      )
    }, 1000)
    timers.current.push(
      setTimeout(() => {
        if (clock.current) {
          clearInterval(clock.current)
          clock.current = null
        }
        const partner = pickPartner(room.sport, userLevel)
        invitePlayer(room.id, partner.initials)
        setSearch((s) =>
          s
            ? { ...s, status: "ready", partner: partner.initials, roomId: room.id }
            : s
        )
      }, SEARCH_MS)
    )
  }
```

- [ ] **Step 3: Expose them in the context value.** In the `const value: MatchmakingContextValue = { … }` object, after `invitePlayer,` add:

```ts
    attachBooking,
    detachBooking,
    fillRoom,
```

- [ ] **Step 4: Verify.**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add components/dashboard/matchmaking.tsx
git commit -m "feat(matchmaking): attachBooking/detachBooking/fillRoom

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: i18n strings (`Play` + `Booking` + additions)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/vi.json`

**Interfaces:**
- Produces: namespaces `Play.*` and `Booking.*`; new keys `ActiveRoom.bookCourt`, `ActiveRoom.booked`, `ActiveRoom.viewInBookings`, `Bookings.cancel`, `Bookings.goingInvited`. (Confirm `Common.status.cancelled`, `Common.format.*`, `Common.sports.*`, `Common.when.*` already exist — they do, used elsewhere — and reuse them.)

- [ ] **Step 1: Add the `Play` namespace** to `messages/en.json` (top-level object, e.g. after `"Assistant"`):

```json
  "Play": {
    "button": "Play",
    "title": "What do you want to do?",
    "bookCourt": "Book a court",
    "bookCourtDesc": "Reserve a slot — solo or with people you know",
    "findTeammates": "Find teammates",
    "findTeammatesDesc": "Let AI find players to join you",
    "both": "Both",
    "bothDesc": "Find players and book a court"
  },
```

- [ ] **Step 2: Add the `Booking` namespace** to `messages/en.json`:

```json
  "Booking": {
    "title": "Book · {court}",
    "pickTitle": "Book a court",
    "description": "Pick a slot, choose your format, and fill the court.",
    "steps": {
      "court": "Court",
      "slot": "Slot",
      "players": "Players",
      "confirm": "Confirm"
    },
    "courtSearch": "Search court name or district…",
    "noCourts": "No courts found",
    "anyDay": "Day",
    "days": {
      "today": "Today",
      "tomorrow": "Tomorrow",
      "sat": "Sat",
      "sun": "Sun",
      "mon": "Mon"
    },
    "slotsFor": "Open slots",
    "taken": "Taken",
    "format": "Format",
    "fillMode": "How are you filling the court?",
    "fill": {
      "court": "Just the court",
      "invite": "Invite players",
      "find": "Find teammates",
      "findHint": "We'll open the remaining seats and find compatible players to fill them."
    },
    "invite": "Invite",
    "added": "Added",
    "invited": "Invited",
    "going": "Going",
    "host": "Host",
    "roster": "Players",
    "summary": "Summary",
    "when": "When",
    "players": "Players",
    "price": "Price",
    "perHead": "{amount}/player",
    "perHour": "/h",
    "justYou": "Just you",
    "goingInvited": "{going} going · {invited} invited",
    "goingCount": "{count} going",
    "finding": "Finding teammates…",
    "conflictWarning": "Heads up — this overlaps another confirmed booking.",
    "back": "Back",
    "next": "Next",
    "confirm": "Confirm booking",
    "roomTitle": "{sport} at {court}",
    "toast": {
      "booked": "Court booked",
      "cancelled": "Booking cancelled"
    }
  },
```

- [ ] **Step 3: Add keys to the existing `ActiveRoom` and `Bookings` namespaces** in `messages/en.json`:

In `ActiveRoom`, add:

```json
    "bookCourt": "Book court",
    "booked": "Booked · {day} · {time}",
    "viewInBookings": "View in Bookings",
```

In `Bookings`, add:

```json
    "cancel": "Cancel booking",
    "goingInvited": "{going} going · {invited} invited",
```

- [ ] **Step 4: Mirror everything in `messages/vi.json`** (same keys, Vietnamese values):

`Play`:

```json
  "Play": {
    "button": "Chơi ngay",
    "title": "Bạn muốn làm gì?",
    "bookCourt": "Đặt sân",
    "bookCourtDesc": "Giữ một khung giờ — chơi một mình hoặc với người quen",
    "findTeammates": "Tìm đồng đội",
    "findTeammatesDesc": "Để AI tìm người chơi cùng bạn",
    "both": "Cả hai",
    "bothDesc": "Tìm người chơi và đặt sân"
  },
```

`Booking`:

```json
  "Booking": {
    "title": "Đặt · {court}",
    "pickTitle": "Đặt sân",
    "description": "Chọn khung giờ, chọn hình thức và lấp đầy sân.",
    "steps": {
      "court": "Sân",
      "slot": "Khung giờ",
      "players": "Người chơi",
      "confirm": "Xác nhận"
    },
    "courtSearch": "Tìm theo tên sân hoặc quận…",
    "noCourts": "Không tìm thấy sân",
    "anyDay": "Ngày",
    "days": {
      "today": "Hôm nay",
      "tomorrow": "Ngày mai",
      "sat": "T.7",
      "sun": "CN",
      "mon": "T.2"
    },
    "slotsFor": "Khung giờ trống",
    "taken": "Đã đặt",
    "format": "Hình thức",
    "fillMode": "Bạn lấp đầy sân thế nào?",
    "fill": {
      "court": "Chỉ đặt sân",
      "invite": "Mời người chơi",
      "find": "Tìm đồng đội",
      "findHint": "Chúng tôi sẽ mở các chỗ còn trống và tìm người chơi phù hợp để lấp đầy."
    },
    "invite": "Mời",
    "added": "Đã thêm",
    "invited": "Đã mời",
    "going": "Tham gia",
    "host": "Chủ phòng",
    "roster": "Người chơi",
    "summary": "Tóm tắt",
    "when": "Thời gian",
    "players": "Người chơi",
    "price": "Giá",
    "perHead": "{amount}/người",
    "perHour": "/giờ",
    "justYou": "Chỉ mình bạn",
    "goingInvited": "{going} tham gia · {invited} đã mời",
    "goingCount": "{count} tham gia",
    "finding": "Đang tìm đồng đội…",
    "conflictWarning": "Lưu ý — khung giờ này trùng với một lượt đặt đã xác nhận.",
    "back": "Quay lại",
    "next": "Tiếp",
    "confirm": "Xác nhận đặt sân",
    "roomTitle": "{sport} tại {court}",
    "toast": {
      "booked": "Đã đặt sân",
      "cancelled": "Đã hủy đặt sân"
    }
  },
```

`ActiveRoom` additions:

```json
    "bookCourt": "Đặt sân",
    "booked": "Đã đặt · {day} · {time}",
    "viewInBookings": "Xem trong Lịch đặt",
```

`Bookings` additions:

```json
    "cancel": "Hủy đặt sân",
    "goingInvited": "{going} tham gia · {invited} đã mời",
```

- [ ] **Step 5: Verify.**

Run: `pnpm typecheck && pnpm lint`
Then: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/vi.json','utf8'));console.log('json ok')"`
Expected: `json ok` (both files are valid JSON; no trailing-comma errors).

- [ ] **Step 6: Commit.**

```bash
git add messages/en.json messages/vi.json
git commit -m "i18n: Play + Booking namespaces (en, vi)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `BookingProvider` store

**Files:**
- Create: `components/dashboard/booking.tsx`

**Interfaces:**
- Consumes (Task 1): `BOOKINGS`, `BOOKING_DAYS`, `COURTS`, `USER`, `slotRange`, `playerByInitials`, `dayKeyForRoom`, types `Booking`, `BookingPlayer`, `Court`, `MatchRoom`, `SportKey`. (Task 2): `useMatchmaking` → `rooms`, `userLevel`, `addRoom`, `attachBooking`, `detachBooking`, `fillRoom`.
- Produces: `export type FillMode = "court" | "invite" | "find"`; `useBooking()` returning the context value below. Consumed by Tasks 5–11.

```ts
interface BookingContextValue {
  bookings: Booking[]
  playOpen: boolean
  openPlay: () => void
  closePlay: () => void
  open: boolean
  courtId: string | null
  roomId: string | null
  court: Court | null
  steps: string[] // ordered step names, e.g. ["slot","players","confirm"]
  step: number // index into steps
  draft: {
    dayKey: string
    slot: string | null
    format: "Singles" | "Doubles"
    fillMode: FillMode
    invitees: string[]
  }
  capacityFor: (format: "Singles" | "Doubles") => number
  openBooking: (
    courtId: string | null,
    opts?: { roomId?: string; fillMode?: FillMode }
  ) => void
  closeBooking: () => void
  next: () => void
  back: () => void
  setCourt: (courtId: string) => void
  setDay: (dayKey: string) => void
  setSlot: (slot: string) => void
  setFormat: (format: "Singles" | "Doubles") => void
  setFillMode: (mode: FillMode) => void
  toggleInvite: (initials: string) => void
  confirmBooking: () => void
  cancelBooking: (id: string) => void
}
```

- [ ] **Step 1: Create `components/dashboard/booking.tsx`** with this full content:

```tsx
"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  BOOKINGS,
  BOOKING_DAYS,
  COURTS,
  USER,
  dayKeyForRoom,
  playerByInitials,
  slotRange,
  type Booking,
  type BookingPlayer,
  type Court,
  type MatchRoom,
  type SportKey,
} from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"

export type FillMode = "court" | "invite" | "find"

interface BookingDraft {
  dayKey: string
  slot: string | null
  format: "Singles" | "Doubles"
  fillMode: FillMode
  invitees: string[]
}

interface BookingContextValue {
  bookings: Booking[]
  playOpen: boolean
  openPlay: () => void
  closePlay: () => void
  open: boolean
  courtId: string | null
  roomId: string | null
  court: Court | null
  steps: string[]
  step: number
  draft: BookingDraft
  capacityFor: (format: "Singles" | "Doubles") => number
  openBooking: (
    courtId: string | null,
    opts?: { roomId?: string; fillMode?: FillMode }
  ) => void
  closeBooking: () => void
  next: () => void
  back: () => void
  setCourt: (courtId: string) => void
  setDay: (dayKey: string) => void
  setSlot: (slot: string) => void
  setFormat: (format: "Singles" | "Doubles") => void
  setFillMode: (mode: FillMode) => void
  toggleInvite: (initials: string) => void
  confirmBooking: () => void
  cancelBooking: (id: string) => void
}

const BookingContext = React.createContext<BookingContextValue | null>(null)

export function useBooking() {
  const ctx = React.useContext(BookingContext)
  if (!ctx) {
    throw new Error("useBooking must be used within a BookingProvider.")
  }
  return ctx
}

const capacityFor = (format: "Singles" | "Doubles") =>
  format === "Singles" ? 2 : 4

/** Build the step list for a launch: prepend "court" only when none is chosen. */
function stepsFor(courtId: string | null): string[] {
  return courtId
    ? ["slot", "players", "confirm"]
    : ["court", "slot", "players", "confirm"]
}

const EMPTY_DRAFT: BookingDraft = {
  dayKey: "today",
  slot: null,
  format: "Doubles",
  fillMode: "court",
  invitees: [],
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")
  const { rooms, userLevel, addRoom, attachBooking, detachBooking, fillRoom } =
    useMatchmaking()

  const [bookings, setBookings] = React.useState<Booking[]>(BOOKINGS)
  const [playOpen, setPlayOpen] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [courtId, setCourtId] = React.useState<string | null>(null)
  const [roomId, setRoomId] = React.useState<string | null>(null)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<BookingDraft>(EMPTY_DRAFT)
  const idRef = React.useRef(0)

  const court = courtId ? COURTS.find((c) => c.id === courtId) ?? null : null
  const steps = stepsFor(courtId)

  const openPlay = () => setPlayOpen(true)
  const closePlay = () => setPlayOpen(false)

  const openBooking = (
    cid: string | null,
    opts?: { roomId?: string; fillMode?: FillMode }
  ) => {
    const rid = opts?.roomId ?? null
    const room = rid ? rooms.find((r) => r.id === rid) ?? null : null
    setPlayOpen(false)
    setCourtId(cid)
    setRoomId(rid)
    setStep(0)
    setDraft({
      dayKey: room ? dayKeyForRoom(room) : "today",
      slot: null,
      format: room?.format ?? "Doubles",
      // A room already exists, so no fill-mode choice; otherwise intent default.
      fillMode: room ? "court" : opts?.fillMode ?? "court",
      invitees: room ? room.players.filter((p) => p !== USER.initials) : [],
    })
    setOpen(true)
  }

  const closeBooking = () => setOpen(false)

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const setCourt = (cid: string) => setCourtId(cid)
  const setDay = (dayKey: string) =>
    setDraft((d) => ({ ...d, dayKey, slot: null }))
  const setSlot = (slot: string) => setDraft((d) => ({ ...d, slot }))
  const setFormat = (format: "Singles" | "Doubles") =>
    setDraft((d) => ({
      ...d,
      format,
      // Trim invitees that no longer fit the smaller format.
      invitees: d.invitees.slice(0, capacityFor(format) - 1),
    }))
  const setFillMode = (fillMode: FillMode) =>
    setDraft((d) => ({ ...d, fillMode }))
  const toggleInvite = (initials: string) =>
    setDraft((d) => {
      if (d.invitees.includes(initials)) {
        return { ...d, invitees: d.invitees.filter((i) => i !== initials) }
      }
      if (d.invitees.length >= capacityFor(d.format) - 1) return d
      return { ...d, invitees: [...d.invitees, initials] }
    })

  /** Construct a MatchRoom for invite/find bookings. */
  const buildRoom = (
    id: string,
    bookingId: string,
    c: Court,
    sport: SportKey,
    players: string[]
  ): MatchRoom => {
    const day = BOOKING_DAYS.find((d) => d.key === draft.dayKey) ?? BOOKING_DAYS[0]
    return {
      id,
      host: { name: USER.name, initials: USER.initials },
      title: t("roomTitle", {
        sport: tc(`sports.${sport}`),
        court: c.name,
      }),
      sport,
      format: draft.format,
      venue: c.name,
      district: c.district,
      distanceKm: c.distanceKm,
      day: day.label,
      time: slotRange(draft.slot ?? "18:00"),
      level: userLevel,
      capacity: capacityFor(draft.format),
      joined: players.length,
      players,
      pricePerHour: c.pricePerHour,
      bookingId,
    }
  }

  const confirmBooking = () => {
    if (!court || !draft.slot) return
    const room = roomId ? rooms.find((r) => r.id === roomId) : null
    const sport = room?.sport ?? court.sports[0]
    const id = `b-new-${idRef.current++}`
    const day = BOOKING_DAYS.find((d) => d.key === draft.dayKey) ?? BOOKING_DAYS[0]
    const time = slotRange(draft.slot)
    const courtLabel = `Court ${COURTS.findIndex((c) => c.id === court.id) + 1}`

    const host: BookingPlayer = {
      name: USER.name,
      initials: USER.initials,
      status: "host",
    }
    let players: BookingPlayer[] = [host]
    let linkedRoomId: string | undefined

    if (room) {
      players = room.players.map((init) =>
        init === USER.initials
          ? host
          : { ...playerByInitials(init), status: "going" as const }
      )
      linkedRoomId = room.id
      attachBooking(room.id, id, { day: day.label, time, venue: court.name })
    } else if (draft.fillMode === "invite") {
      players = [
        host,
        ...draft.invitees.map((init) => ({
          ...playerByInitials(init),
          status: "pending" as const,
        })),
      ]
      const rid = `r-bk-${idRef.current++}`
      addRoom(buildRoom(rid, id, court, sport, [USER.initials, ...draft.invitees]))
      linkedRoomId = rid
    } else if (draft.fillMode === "find") {
      const rid = `r-bk-${idRef.current++}`
      const newRoom = buildRoom(rid, id, court, sport, [USER.initials])
      addRoom(newRoom)
      linkedRoomId = rid
      fillRoom(newRoom)
    }

    const booking: Booking = {
      id,
      sport,
      format: draft.format,
      venue: court.name,
      court: courtLabel,
      day: day.label,
      dayKey: draft.dayKey,
      time,
      status: "confirmed",
      withPlayers: players,
      roomId: linkedRoomId,
      pricePerHour: court.pricePerHour,
    }
    setBookings((prev) => [booking, ...prev])
    toast.success(t("toast.booked"), {
      description: `${court.name} · ${day.label} · ${time}`,
    })
    setOpen(false)
  }

  const cancelBooking = (id: string) => {
    const booking = bookings.find((b) => b.id === id)
    if (booking?.roomId) detachBooking(booking.roomId)
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
    )
    toast(t("toast.cancelled"), { description: booking?.venue })
  }

  const value: BookingContextValue = {
    bookings,
    playOpen,
    openPlay,
    closePlay,
    open,
    courtId,
    roomId,
    court,
    steps,
    step,
    draft,
    capacityFor,
    openBooking,
    closeBooking,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    confirmBooking,
    cancelBooking,
  }

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  )
}
```

- [ ] **Step 2: Verify.**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (The provider is not mounted yet — it just needs to compile. `useMatchmaking` types must line up with Task 2's additions.)

- [ ] **Step 3: Commit.**

```bash
git add components/dashboard/booking.tsx
git commit -m "feat(booking): BookingProvider store + actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `PlayChooser` intent dialog

**Files:**
- Create: `components/dashboard/play-chooser.tsx`

**Interfaces:**
- Consumes (Task 4): `useBooking()` → `playOpen`, `closePlay`, `openBooking`. Router via `@/i18n/navigation`.
- Produces: `export function PlayChooser()`. Mounted in Task 7.

- [ ] **Step 1: Create `components/dashboard/play-chooser.tsx`:**

```tsx
"use client"

import { useTranslations } from "next-intl"
import { ChevronRight, MapPin, Users, Zap } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBooking } from "@/components/dashboard/booking"
import { useRouter } from "@/i18n/navigation"

export function PlayChooser() {
  const t = useTranslations("Play")
  const { playOpen, closePlay, openBooking } = useBooking()
  const router = useRouter()

  const options = [
    {
      key: "book",
      icon: MapPin,
      title: t("bookCourt"),
      desc: t("bookCourtDesc"),
      onClick: () => openBooking(null, { fillMode: "court" }),
    },
    {
      key: "teammates",
      icon: Users,
      title: t("findTeammates"),
      desc: t("findTeammatesDesc"),
      onClick: () => {
        closePlay()
        router.push("/dashboard/match-maker")
      },
    },
    {
      key: "both",
      icon: Zap,
      title: t("both"),
      desc: t("bothDesc"),
      onClick: () => openBooking(null, { fillMode: "find" }),
    },
  ]

  return (
    <Dialog open={playOpen} onOpenChange={(o) => !o && closePlay()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("title")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.onClick}
              className="flex items-center gap-3 rounded-3xl border border-border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                <o.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading font-semibold">
                  {o.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {o.desc}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify.**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add components/dashboard/play-chooser.tsx
git commit -m "feat(booking): Play intent chooser dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `BookingDialog` wizard

**Files:**
- Create: `components/dashboard/booking-dialog.tsx`

**Interfaces:**
- Consumes (Task 4): `useBooking()` full value. (Task 1): `BOOKING_DAYS`, `COURTS`, `MATCH_SUGGESTIONS`, `USER`, `courtSlots`, `slotRange`, `formatVnd`, `playerByInitials`. `LevelChip`/`PlayerAvatar` from shared.
- Produces: `export function BookingDialog()`. Mounted in Task 7.

- [ ] **Step 1: Create `components/dashboard/booking-dialog.tsx`:**

```tsx
"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Check, MapPin, Search, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LevelChip, PlayerAvatar } from "@/components/dashboard/shared"
import {
  BOOKING_DAYS,
  COURTS,
  MATCH_SUGGESTIONS,
  USER,
  courtSlots,
  formatVnd,
  playerByInitials,
  slotRange,
} from "@/components/dashboard/data"
import { useBooking, type FillMode } from "@/components/dashboard/booking"

/** Segmented single-select chips (same pattern as the Quick Join filters). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={o.value === value ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export function BookingDialog() {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")
  const {
    open,
    closeBooking,
    court,
    courtId,
    roomId,
    steps,
    step,
    draft,
    bookings,
    capacityFor,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    confirmBooking,
  } = useBooking()

  const [courtQuery, setCourtQuery] = React.useState("")
  React.useEffect(() => {
    if (!open) setCourtQuery("")
  }, [open])

  const stepName = steps[step]
  const isLast = step === steps.length - 1
  const sport = court?.sports[0]

  // Court step search
  const needle = courtQuery.trim().toLowerCase()
  const courtResults = needle
    ? COURTS.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.district.toLowerCase().includes(needle)
      )
    : COURTS

  // Slot step grid
  const slots = courtId ? courtSlots(courtId, draft.dayKey) : []

  // Players step
  const maxInvites = capacityFor(draft.format) - 1
  const invitable = sport
    ? [...MATCH_SUGGESTIONS]
        .filter((p) => p.initials !== USER.initials)
        .sort((a, b) => (a.sport === sport ? 0 : 1) - (b.sport === sport ? 0 : 1))
    : MATCH_SUGGESTIONS

  // Confirm step
  const conflict =
    draft.slot &&
    bookings.some(
      (b) =>
        b.status === "confirmed" &&
        b.dayKey === draft.dayKey &&
        b.time === slotRange(draft.slot!)
    )
  const headCount =
    draft.fillMode === "find" && !roomId
      ? capacityFor(draft.format)
      : 1 + draft.invitees.length
  const playersLine =
    draft.fillMode === "find" && !roomId
      ? t("finding")
      : roomId
        ? t("goingCount", { count: 1 + draft.invitees.length })
        : draft.invitees.length
          ? t("goingInvited", { going: 1, invited: draft.invitees.length })
          : t("justYou")

  const canNext =
    stepName === "court"
      ? Boolean(courtId)
      : stepName === "slot"
        ? Boolean(draft.slot)
        : true

  const title = court
    ? t("title", { court: court.name })
    : t("pickTitle")

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeBooking()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium",
                  i === step
                    ? "text-foreground"
                    : i < step
                      ? "text-brand"
                      : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[10px] tabular-nums",
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-brand/15 text-brand"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t(`steps.${s}`)}</span>
              </span>
              {i < steps.length - 1 ? (
                <span className="h-px flex-1 bg-border" />
              ) : null}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col gap-4 py-1">
          {/* COURT */}
          {stepName === "court" ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={courtQuery}
                  onChange={(e) => setCourtQuery(e.target.value)}
                  placeholder={t("courtSearch")}
                  aria-label={t("courtSearch")}
                  className="h-9 pl-8"
                />
              </div>
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-border p-1">
                {courtResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCourt(c.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                      courtId === c.id
                        ? "bg-secondary font-medium"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      · {c.district}
                    </span>
                    <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums">
                      {formatVnd(c.pricePerHour)}
                    </span>
                  </button>
                ))}
                {courtResults.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    {t("noCourts")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* SLOT */}
          {stepName === "slot" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t("anyDay")}</Label>
                <Segmented
                  value={draft.dayKey}
                  onChange={setDay}
                  options={BOOKING_DAYS.map((d) => ({
                    value: d.key,
                    label: t(`days.${d.key}`),
                  }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("slotsFor")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      disabled={s.taken}
                      onClick={() => setSlot(s.time)}
                      className={cn(
                        "rounded-2xl border px-2 py-2 text-center text-sm font-medium tabular-nums transition-colors",
                        s.taken
                          ? "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/50 line-through"
                          : draft.slot === s.time
                            ? "border-brand bg-brand/12 text-brand"
                            : "border-border hover:bg-muted/60"
                      )}
                    >
                      {slotRange(s.time).split(" – ")[0]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* PLAYERS */}
          {stepName === "players" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t("format")}</Label>
                <Segmented
                  value={draft.format}
                  onChange={(v) => !roomId && setFormat(v)}
                  options={[
                    { value: "Singles", label: tc("format.singles") },
                    { value: "Doubles", label: tc("format.doubles") },
                  ]}
                />
              </div>

              {roomId ? (
                <div className="flex flex-col gap-2">
                  <Label>{t("roster")}</Label>
                  {[USER.initials, ...draft.invitees].map((init) => {
                    const p = playerByInitials(init)
                    const you = init === USER.initials
                    return (
                      <div key={init} className="flex items-center gap-2.5">
                        <PlayerAvatar initials={init} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {you ? t("host") : t("going")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("fillMode")}</Label>
                    <Segmented
                      value={draft.fillMode}
                      onChange={(v) => setFillMode(v as FillMode)}
                      options={[
                        { value: "court", label: t("fill.court") },
                        { value: "invite", label: t("fill.invite") },
                        { value: "find", label: t("fill.find") },
                      ]}
                    />
                  </div>

                  {draft.fillMode === "invite" ? (
                    <div className="flex flex-col gap-1">
                      {invitable.map((p) => {
                        const added = draft.invitees.includes(p.initials)
                        const atCap = draft.invitees.length >= maxInvites
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2.5 p-1"
                          >
                            <PlayerAvatar initials={p.initials} />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-sm">{p.name}</span>
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <LevelChip level={p.level} />
                                {tc(`sports.${p.sport}`)}
                              </span>
                            </div>
                            <Button
                              size="xs"
                              variant={added ? "secondary" : "outline"}
                              disabled={!added && atCap}
                              className="shrink-0 rounded-full"
                              onClick={() => toggleInvite(p.initials)}
                            >
                              {added ? (
                                <>
                                  <Check />
                                  {t("added")}
                                </>
                              ) : (
                                t("invite")
                              )}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {draft.fillMode === "find" ? (
                    <p className="inline-flex items-start gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                      <Users className="mt-0.5 size-3.5 shrink-0" />
                      {t("fill.findHint")}
                    </p>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {/* CONFIRM */}
          {stepName === "confirm" && court && draft.slot ? (
            <div className="flex flex-col gap-3 rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
              <SummaryRow label={t("steps.court")} value={court.name} />
              <SummaryRow
                label={t("when")}
                value={`${t(`days.${draft.dayKey}`)} · ${slotRange(draft.slot)}`}
              />
              <SummaryRow
                label={t("format")}
                value={tc(`format.${draft.format.toLowerCase()}`)}
              />
              <SummaryRow label={t("players")} value={playersLine} />
              <SummaryRow
                label={t("price")}
                value={`${formatVnd(court.pricePerHour)}${t("perHour")} · ${t(
                  "perHead",
                  {
                    amount: formatVnd(
                      Math.round(court.pricePerHour / Math.max(1, headCount))
                    ),
                  }
                )}`}
              />
              {conflict ? (
                <p className="text-xs font-medium text-destructive">
                  {t("conflictWarning")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          {step > 0 ? (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={back}
            >
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          {isLast ? (
            <Button className="rounded-full" onClick={confirmBooking}>
              <Check />
              {t("confirm")}
            </Button>
          ) : (
            <Button
              className="rounded-full"
              disabled={!canNext}
              onClick={next}
            >
              {t("next")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify.**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Confirm `Button` supports the `size="xs"` and `variant="secondary"` props (they're used in `active-room.tsx` / `match-maker.tsx`).

- [ ] **Step 3: Commit.**

```bash
git add components/dashboard/booking-dialog.tsx
git commit -m "feat(booking): multi-step booking wizard dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Mount providers + wire Find Courts (first end-to-end milestone)

**Files:**
- Modify: `app/[locale]/dashboard/layout.tsx`
- Modify: `components/dashboard/views/find-courts.tsx`

**Interfaces:**
- Consumes (Tasks 4–6): `BookingProvider`, `useBooking`, `PlayChooser`, `BookingDialog`.

- [ ] **Step 1: Update the dashboard layout.** Replace the body of `app/[locale]/dashboard/layout.tsx` with:

```tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { BookingProvider } from "@/components/dashboard/booking"
import { BookingDialog } from "@/components/dashboard/booking-dialog"
import { ChatProvider } from "@/components/dashboard/chat-store"
import { CourtAssistant } from "@/components/dashboard/court-assistant"
import {
  MatchmakingDock,
  MatchmakingProvider,
} from "@/components/dashboard/matchmaking"
import { NotificationsProvider } from "@/components/dashboard/notifications"
import { PlayChooser } from "@/components/dashboard/play-chooser"
import { DashboardTopbar } from "@/components/dashboard/topbar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <MatchmakingProvider>
        <BookingProvider>
          <NotificationsProvider>
            <ChatProvider>
              <SidebarProvider className="font-geist">
                <AppSidebar />
                <SidebarInset className="overflow-hidden">
                  <DashboardTopbar />
                  <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {children}
                  </main>
                  <CourtAssistant />
                </SidebarInset>
              </SidebarProvider>
            </ChatProvider>
          </NotificationsProvider>
          <MatchmakingDock />
          <PlayChooser />
          <BookingDialog />
          <Toaster />
        </BookingProvider>
      </MatchmakingProvider>
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Wire the Find Courts Book button.** In `components/dashboard/views/find-courts.tsx`:

Add the import near the other dashboard imports:

```tsx
import { useBooking } from "@/components/dashboard/booking"
```

In `CourtCard`, read the action and wire the button. Change the component signature/body so it calls `openBooking`:

```tsx
function CourtCard({ court }: { court: Court }) {
  const t = useTranslations("FindCourts")
  const { openBooking } = useBooking()
```

and the existing Book button becomes:

```tsx
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => openBooking(court.id)}
          >
            {t("book")}
          </Button>
```

- [ ] **Step 3: Verify (first real milestone).**

Run: `pnpm typecheck && pnpm lint`, then `pnpm dev`.
Browser: Dashboard → Find Courts → click **Book** on a card. The wizard opens titled "Book · <court>", showing `Slot · Players · Confirm` (no Court step). Pick a day, pick a free slot (taken slots are struck/disabled), Next → "Just the court" selected → Next → Confirm summary shows court/when/price → **Confirm booking** → success toast; dialog closes. (The Bookings *page* won't reflect it until Task 8 — that's expected.)

- [ ] **Step 4: Commit.**

```bash
git add app/[locale]/dashboard/layout.tsx components/dashboard/views/find-courts.tsx
git commit -m "feat(booking): mount provider + wire Find Courts book

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Bookings page — live list, New booking, Rebook, Manage, going/invited

**Files:**
- Modify: `components/dashboard/views/bookings.tsx`

**Interfaces:**
- Consumes (Tasks 1, 4): `useBooking()` → `bookings`, `openPlay`, `openBooking`, `cancelBooking`; `courtByVenue`, `type BookingPlayer`.

- [ ] **Step 1: Switch the page to the live list + new actions.** In `components/dashboard/views/bookings.tsx`:

Update imports:

```tsx
import {
  courtByVenue,
  type Booking,
  type BookingStatus,
} from "@/components/dashboard/data"
import { useBooking } from "@/components/dashboard/booking"
```

Replace the top of `BookingsView` so it reads from the provider and wires "New booking":

```tsx
export function BookingsView() {
  const t = useTranslations("Bookings")
  const [filter, setFilter] = React.useState<Filter>("upcoming")
  const { bookings, openPlay } = useBooking()

  const visible = bookings.filter((b) => {
    if (filter === "all") return true
    const upcoming = UPCOMING.includes(b.status)
    return filter === "upcoming" ? upcoming : !upcoming
  })
```

(Use `visible` in the JSX where `bookings` was previously mapped, and the `New booking` button becomes `onClick={openPlay}`):

```tsx
        <Button size="sm" className="rounded-full" onClick={openPlay}>
          <CalendarPlus />
          {t("newBooking")}
        </Button>
```

and:

```tsx
      {visible.length ? (
        <div className="flex flex-col gap-3">
          {visible.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      ) : (
```

- [ ] **Step 2: Wire Manage (cancel), Rebook, and the going/invited line in `BookingCard`.** Add at the top of `BookingCard`:

```tsx
function BookingCard({ booking }: { booking: Booking }) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const { cancelBooking, openBooking } = useBooking()
  const done = booking.status === "completed"
  const cancelled = booking.status === "cancelled"

  const going = booking.withPlayers.filter((p) => p.status !== "pending").length
  const invited = booking.withPlayers.filter((p) => p.status === "pending").length
```

Also make the existing day label resolve a new booking's `dayKey`. Add a `Booking` translator and update `dayLabel`:

```tsx
  const tb = useTranslations("Booking")
  const whenKey = WHEN_KEY[booking.day]
  const dayLabel = booking.dayKey
    ? tb(`days.${booking.dayKey}`)
    : whenKey
      ? tc(`when.${whenKey}`)
      : t(`records.${booking.id}.day`)
```

(Replace the existing two lines that compute `whenKey`/`dayLabel`.)

Add a players summary line under the venue details (after the existing `<Clock/>` row, inside the details block):

```tsx
          {invited > 0 ? (
            <span className="inline-flex items-center gap-1">
              {t("goingInvited", { going, invited })}
            </span>
          ) : null}
```

Replace the bottom action block (the `{!done ? (manage) : (rebook)}` section) with:

```tsx
      {done || cancelled ? (
        <div className="shrink-0 sm:ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-full sm:w-auto"
            onClick={() => openBooking(courtByVenue(booking.venue)?.id ?? null)}
          >
            {t("rebook")}
          </Button>
        </div>
      ) : (
        <div className="shrink-0 sm:ml-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full sm:w-auto"
            onClick={() => cancelBooking(booking.id)}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
```

- [ ] **Step 3: Verify.**

Run: `pnpm typecheck && pnpm lint`, then `pnpm dev`.
Browser:
- Book a court (Find Courts → Book → … → Confirm). Go to **Bookings** → the new booking appears at the top under "Upcoming" with status "confirmed".
- On an upcoming booking, click **Cancel booking** → status flips to `cancelled` (visible under "All"); a toast shows.
- On a past/cancelled booking, **Rebook** opens the wizard prefilled to that court.
- "New booking" opens the Play chooser.

- [ ] **Step 4: Commit.**

```bash
git add components/dashboard/views/bookings.tsx
git commit -m "feat(bookings): live list, new/rebook/cancel, going-invited

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Play triggers — topbar, overview CTA, assistant chip

**Files:**
- Modify: `components/dashboard/topbar.tsx`
- Modify: `components/dashboard/views/overview.tsx`
- Modify: `components/dashboard/court-assistant.tsx`

**Interfaces:**
- Consumes (Task 4): `useBooking()` → `openPlay`.

- [ ] **Step 1: Topbar Play button.** In `components/dashboard/topbar.tsx`:

Replace the `Plus` import line and add hooks:

```tsx
import { Play } from "lucide-react"
import { useTranslations } from "next-intl"

import { useBooking } from "@/components/dashboard/booking"
```

Inside `DashboardTopbar`, **remove** the now-unused `const t = useTranslations("Topbar")` line, add `const tPlay = useTranslations("Play")` and `const { openPlay } = useBooking()`, then replace the final button:

```tsx
      <Button size="sm" className="rounded-full" onClick={openPlay}>
        <Play />
        <span className="hidden sm:inline">{tPlay("button")}</span>
      </Button>
```

(`t("newMatch")` from the `Topbar` namespace is no longer used here; leave the key in messages — harmless.)

- [ ] **Step 2: Overview Play CTA + wire court rows.** In `components/dashboard/views/overview.tsx`:

Add imports:

```tsx
import { Play } from "lucide-react"
import { useBooking } from "@/components/dashboard/booking"
```

In `OverviewView`, add `const tPlay = useTranslations("Play")` and `const { openPlay, openBooking } = useBooking()`.

Add a Play button in the greeting block — change the greeting `<div>` wrapper to include it on the right. Inside the first `<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">`, the `Tabs` is the second child; wrap the tabs + a new button in a flex container, or simplest — add the button right after the greeting `<div>` and before `<Tabs>`:

```tsx
        <div className="flex items-center gap-2">
          <Button className="rounded-full" onClick={openPlay}>
            <Play />
            {tPlay("button")}
          </Button>
        </div>
```

Wire the Courts panel rows' Book action:

```tsx
                <CourtRow
                  key={c.id}
                  court={c}
                  action={
                    <RowAction onClick={() => openBooking(c.id)}>
                      {t("book")}
                    </RowAction>
                  }
                />
```

- [ ] **Step 3: Assistant Play chip.** In `components/dashboard/court-assistant.tsx`:

Add `import { useBooking } from "@/components/dashboard/booking"`. In `CourtAssistant`, add `const { openPlay } = useBooking()` and `const tPlay = useTranslations("Play")`.

Add a Play chip alongside the suggestion chips (the `showSuggestions` block). Inside that `<div className="mt-1 flex flex-wrap gap-2">`, prepend:

```tsx
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      openPlay()
                    }}
                    className="rounded-full bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
                  >
                    {tPlay("button")}
                  </button>
```

- [ ] **Step 4: Verify.**

Run: `pnpm typecheck && pnpm lint`, then `pnpm dev`.
Browser:
- Topbar **Play** → chooser opens. **Book a court** → wizard starts at the **Court** step (searchable list) → pick a court → it advances to Slot. **Find teammates** → navigates to Match Maker, nothing booked. **Both** → wizard at Court step; on the Players step "Find teammates" is preselected.
- Overview **Play** CTA opens the chooser; an Overview court row **book** opens the wizard for that court.
- Assistant: open it → the **Play** chip opens the chooser (panel closes).

- [ ] **Step 5: Commit.**

```bash
git add components/dashboard/topbar.tsx components/dashboard/views/overview.tsx components/dashboard/court-assistant.tsx
git commit -m "feat(booking): Play triggers in topbar, overview, assistant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Assistant recommendation Book

**Files:**
- Modify: `components/dashboard/court-assistant.tsx`

**Interfaces:**
- Consumes (Task 4): `useBooking()` → `openBooking` (already imported in Task 9).

- [ ] **Step 1: Wire the recommendation rows' Book action.** In `court-assistant.tsx`, the `ResultBlock` renders `CourtRow` with `action={<RowAction>{t("book")}</RowAction>}`. `ResultBlock` needs access to `openBooking`. Add the hook inside `ResultBlock`:

```tsx
function ResultBlock({ msg }: { msg: Extract<Msg, { type: "result" }> }) {
  const t = useTranslations("Assistant")
  const { openBooking } = useBooking()
```

and change the action:

```tsx
            {courts.map((c) => (
              <CourtRow
                key={c.id}
                court={c}
                action={
                  <RowAction onClick={() => openBooking(c.id)}>
                    {t("book")}
                  </RowAction>
                }
              />
            ))}
```

- [ ] **Step 2: Verify.**

Run: `pnpm typecheck && pnpm lint`, then `pnpm dev`.
Browser: open the assistant → send a query (or click a suggestion) → on a recommended court row click **Book** → the wizard opens for that court (Slot step, court preselected). The assistant panel stays open behind the modal overlay.

- [ ] **Step 3: Commit.**

```bash
git add components/dashboard/court-assistant.tsx
git commit -m "feat(assistant): wire recommendation Book to booking wizard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Room → booking ("Book court" / "Booked" in the room manager)

**Files:**
- Modify: `components/dashboard/active-room.tsx`

**Interfaces:**
- Consumes (Tasks 1, 4): `useBooking()` → `openBooking`; `courtByVenue`; matchmaking `courtFor`-style fallback handled inline.

- [ ] **Step 1: Add the booking CTA to the room detail.** In `components/dashboard/active-room.tsx`:

Add the two icons to the existing `lucide-react` import, add `COURTS` and
`courtByVenue` to the existing `@/components/dashboard/data` import, and add the
booking hook import:

```tsx
import { CalendarCheck, CalendarPlus } from "lucide-react" // merge into existing
import { COURTS, courtByVenue } from "@/components/dashboard/data" // merge into existing
import { useBooking } from "@/components/dashboard/booking"
```

In `RoomDetail`, add `const tb = useTranslations("ActiveRoom")` is already `t`; add the booking hook and a derived day label. Near the existing destructures add:

```tsx
  const { openBooking } = useBooking()
```

Then in the **Location** `<section>`, after the three `DetailRow`s, add the host-only CTA / status:

```tsx
          {isHost ? (
            room.bookingId ? (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand/10 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-brand">
                  <CalendarCheck className="size-4" />
                  {t("booked", {
                    day: roomDayLabel(room.day, tc),
                    time: room.time,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="rounded-full"
                  onClick={() => {
                    router.push("/dashboard/bookings")
                    onClose()
                  }}
                >
                  {t("viewInBookings")}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-full"
                onClick={() => {
                  const c =
                    courtByVenue(room.venue) ??
                    COURTS.filter((x) => x.sports.includes(room.sport)).sort(
                      (a, b) => a.distanceKm - b.distanceKm
                    )[0]
                  openBooking(c?.id ?? null, { roomId: room.id })
                  onClose()
                }}
              >
                <CalendarPlus />
                {t("bookCourt")}
              </Button>
            )
          ) : null}
```

- [ ] **Step 2: Verify (the integration loop).**

Run: `pnpm typecheck && pnpm lint`, then `pnpm dev`.
Browser:
- Match Maker → **Join** a room (or host one) → open the room via the topbar **active-room pill** → in the room manager (host only), the Location section shows **Book court**.
- Click it → the wizard opens for the room's court, the Players step shows the **locked roster** (no fill-mode choice), pick a slot → Confirm.
- Reopen the room → it now shows **"Booked · <day> · <time>"** + "View in Bookings", and "Book court" is gone.
- The new booking is in Bookings carrying the room's players (host + members "going").

- [ ] **Step 3: Commit.**

```bash
git add components/dashboard/active-room.tsx
git commit -m "feat(active-room): book a court for the room / booked status

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final integration verification

**Files:** none (verification + any glue fixes uncovered).

- [ ] **Step 1: Production build + checks.**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS (no type errors, no lint errors, build succeeds).

- [ ] **Step 2: Walk the spec §9 matrix in `pnpm dev`** (light + dark via `l`, and both `en`/`vi` via the locale switcher):

1. **Chooser routing:** Play → Book a court → Court step → pick → slot → "Just the court" → Confirm → appears in Bookings ("Just you"), no room created. Find teammates → Match Maker, nothing booked. Both → wizard with "Find teammates" preselected.
2. **AI handoff:** assistant → recommendation → Book → wizard for that court (skips Court step).
3. **Invite mode:** Book a court → slot → "Invite players" → add two → Confirm → Bookings shows "1 going · 2 invited"; a linked room appears in Match Maker.
4. **Find mode:** Both → court + slot → Confirm → booking created, an open room appears, and the floating dock runs the partner search and auto-fills a seat.
5. **Room → booking:** join/host → room manager → Book court → locked roster → Confirm → "Booked …"; players carried; "Book court" gone.
6. **Guards:** taken slots unselectable; invites stop at capacity; Doubles→Singles trims invitees; cancel a booking → `cancelled`, the linked room's "Booked" reverts to "Book court"; rebook prefills the court.

- [ ] **Step 3: If any check fails,** fix inline (most likely spots: a missing i18n key → add to both files; a `size`/`variant` prop mismatch on `Button`; a stale-closure in `confirmBooking` reading `rooms`). Re-run Step 1.

- [ ] **Step 4: Final commit (if Step 3 changed anything).**

```bash
git add -A
git commit -m "fix(booking): integration verification fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Play chooser (T5/T9), wizard incl. Court step (T6), data/slot model (T1), provider + fillMode (T4), matchmaking attach/detach/fill (T2), entry points find-courts (T7) / bookings (T8) / topbar+overview+assistant (T9/T10) / active-room (T11), integrity guards (capacity in T4 `toggleInvite`/`setFormat`; taken slots in T6; host-only in T11; cancel→detach in T4; conflict warning in T6), i18n (T3), verification (T12).
- **Type consistency:** `FillMode` is defined once in `booking.tsx` and imported by `booking-dialog.tsx`. `capacityFor` is module-level in `booking.tsx` and also exposed on the context (the dialog uses the context one). `BookingPlayer.status` values are exactly `"host" | "going" | "pending"`.
- **Known fiddly bit:** `confirmBooking` reads `rooms` from the matchmaking closure at call time; this is fine for the room→booking path because the room already exists. The new room created for invite/find is referenced by the object/id we generate, never read back from `rooms` — and `fillRoom` takes the room object precisely because `addRoom`'s state write hasn't flushed yet.
