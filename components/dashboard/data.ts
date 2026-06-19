// Mock data for the SportMatch AI player dashboard.
// All values are static so server and client renders stay in sync.

export type SportKey = "tennis" | "pickleball" | "badminton"

export interface Sport {
  key: SportKey
  label: string
  short: string
  /** Tailwind background class used for the sport's accent dot/tag. */
  accent: string
}

export const SPORTS: Sport[] = [
  { key: "tennis", label: "Tennis", short: "TN", accent: "bg-chart-2" },
  { key: "pickleball", label: "Pickleball", short: "PK", accent: "bg-lime" },
  { key: "badminton", label: "Badminton", short: "BD", accent: "bg-chart-3" },
]

const sportBy = (k: SportKey) => SPORTS.find((s) => s.key === k)
export const sportLabel = (k: SportKey) => sportBy(k)?.label ?? k
export const sportShort = (k: SportKey) => sportBy(k)?.short ?? "??"
export const sportAccent = (k: SportKey) => sportBy(k)?.accent ?? "bg-muted"

/** Format a VND amount as a compact "180K" string. */
export const formatVnd = (vnd: number) => `${Math.round(vnd / 1000)}K`

/**
 * Format a full VND amount with "." thousands separators, e.g. 360000 →
 * "360.000₫". Used on the payment screen where the exact charge is shown.
 * Hand-rolled (no `toLocaleString`) so server and client renders agree.
 */
export const formatVndFull = (vnd: number) =>
  `${Math.round(vnd)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}₫`

/** Self-declared skill level. The platform never computes or changes this. */
export type Level = "beginner" | "intermediate" | "advanced"
/** A room targets one level, or welcomes any level. */
export type RoomLevel = Level | "any"

/** The three levels in order, each with a theme tint for chips. */
export const LEVELS: { value: Level; accent: string }[] = [
  { value: "beginner", accent: "bg-chart-2/12 text-chart-2" },
  { value: "intermediate", accent: "bg-brand/12 text-brand" },
  { value: "advanced", accent: "bg-chart-5/15 text-chart-5" },
]

/** Tint classes per room level (includes "any"). */
export const levelAccent: Record<RoomLevel, string> = {
  beginner: "bg-chart-2/12 text-chart-2",
  intermediate: "bg-brand/12 text-brand",
  advanced: "bg-chart-5/15 text-chart-5",
  any: "bg-muted text-muted-foreground",
}

/** The three levels in difficulty order, for the soft-match window. */
const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"]

/**
 * Whether a player of `playerLevel` fits a room targeting `roomLevel`. A soft
 * preference, not a hard gate: the exact level or one adjacent step is welcome
 * ("any" welcomes everyone).
 */
export function levelMatches(
  playerLevel: Level,
  roomLevel: RoomLevel
): boolean {
  if (roomLevel === "any") return true
  return (
    Math.abs(
      LEVEL_ORDER.indexOf(playerLevel) - LEVEL_ORDER.indexOf(roomLevel)
    ) <= 1
  )
}

export const USER = {
  name: "Nguyễn Minh",
  first: "Minh",
  initials: "NM",
  handle: "@minh",
  city: "Hà Nội",
  /** Default self-declared level; mutable at runtime via the sidebar picker. */
  level: "intermediate" as Level,
  /** Reliability/reputation score, 0–100. */
  trust: 92,
}

export interface Player {
  id: string
  name: string
  initials: string
  level: Level
  sport: SportKey
  distanceKm: number
  /** AI compatibility score, 0–100. */
  matchPct: number
  /** Reliability/reputation score, 0–100. */
  trust: number
  online: boolean
  blurb: string
}

export const MATCH_SUGGESTIONS: Player[] = [
  {
    id: "p1",
    name: "Trần Huy",
    initials: "TH",
    level: "advanced",
    sport: "badminton",
    distanceKm: 1.2,
    matchPct: 96,
    trust: 88,
    online: true,
    blurb: "Plays evenings · aggressive baseliner",
  },
  {
    id: "p2",
    name: "Lê Lan",
    initials: "LL",
    level: "intermediate",
    sport: "pickleball",
    distanceKm: 2.4,
    matchPct: 92,
    trust: 95,
    online: true,
    blurb: "Looking for doubles partner",
  },
  {
    id: "p3",
    name: "Phạm Quân",
    initials: "PQ",
    level: "advanced",
    sport: "tennis",
    distanceKm: 3.1,
    matchPct: 89,
    trust: 84,
    online: false,
    blurb: "Weekend singles · all-court",
  },
  {
    id: "p4",
    name: "Đỗ Anh",
    initials: "ĐA",
    level: "beginner",
    sport: "pickleball",
    distanceKm: 0.8,
    matchPct: 87,
    trust: 79,
    online: true,
    blurb: "New to the area, very social",
  },
  {
    id: "p5",
    name: "Vũ Hà",
    initials: "VH",
    level: "advanced",
    sport: "tennis",
    distanceKm: 4.6,
    matchPct: 84,
    trust: 91,
    online: false,
    blurb: "Competitive · league regular",
  },
  {
    id: "p6",
    name: "Bùi Khang",
    initials: "BK",
    level: "intermediate",
    sport: "badminton",
    distanceKm: 2.0,
    matchPct: 81,
    trust: 76,
    online: true,
    blurb: "Fast hands, fun rallies",
  },
]

/** A participant resolvable from a match room's `players` initials. */
export interface RosterEntry {
  name: string
  initials: string
  /** Self-declared level. For the user, the live value comes from the provider. */
  level: Level
  /** Reliability/reputation score, 0–100. */
  trust: number
}

// Everyone a room's `players` initials can refer to: the user + suggestions.
const ROSTER: RosterEntry[] = [
  {
    name: USER.name,
    initials: USER.initials,
    level: USER.level,
    trust: USER.trust,
  },
  ...MATCH_SUGGESTIONS.map((p) => ({
    name: p.name,
    initials: p.initials,
    level: p.level,
    trust: p.trust,
  })),
]

/** Resolve a room participant's initials to their name, level and trust. */
export function playerByInitials(initials: string): RosterEntry {
  return (
    ROSTER.find((p) => p.initials === initials) ?? {
      name: initials,
      initials,
      level: "intermediate",
      trust: 70,
    }
  )
}

export type TrustTier = "trusted" | "reliable" | "new"

/** Bucket a 0–100 trust score into a reputation tier. */
export function trustTier(trust: number): TrustTier {
  if (trust >= 85) return "trusted"
  if (trust >= 70) return "reliable"
  return "new"
}

/** Text-color class for each trust tier (kept on the emerald/lime theme). */
export const trustTierAccent: Record<TrustTier, string> = {
  trusted: "text-brand",
  reliable: "text-chart-3",
  new: "text-muted-foreground",
}

export interface Court {
  id: string
  name: string
  district: string
  sports: SportKey[]
  surface: string
  pricePerHour: number
  distanceKm: number
  rating: number
  openSlots: number
  nextSlot: string
  /** Share of today's slots still free, 0–100. */
  freePct: number
}

export const COURTS: Court[] = [
  {
    id: "c1",
    name: "Shuttle Republic",
    district: "Cầu Giấy",
    sports: ["badminton"],
    surface: "Sprung timber · indoor",
    pricePerHour: 360000,
    distanceKm: 1.2,
    rating: 4.8,
    openSlots: 5,
    nextSlot: "18:30",
    freePct: 42,
  },
  {
    id: "c2",
    name: "Ace Tennis Club",
    district: "Tây Hồ",
    sports: ["tennis"],
    surface: "Hard · Plexicushion",
    pricePerHour: 220000,
    distanceKm: 2.6,
    rating: 4.7,
    openSlots: 3,
    nextSlot: "19:00",
    freePct: 28,
  },
  {
    id: "c3",
    name: "Smash Pickleball",
    district: "Đống Đa",
    sports: ["pickleball", "badminton"],
    surface: "Cushioned acrylic",
    pricePerHour: 150000,
    distanceKm: 0.9,
    rating: 4.6,
    openSlots: 8,
    nextSlot: "17:45",
    freePct: 64,
  },
  {
    id: "c4",
    name: "Rally Point Club",
    district: "Ba Đình",
    sports: ["tennis", "pickleball"],
    surface: "Clay · outdoor",
    pricePerHour: 280000,
    distanceKm: 3.4,
    rating: 4.5,
    openSlots: 2,
    nextSlot: "20:15",
    freePct: 18,
  },
  {
    id: "c5",
    name: "Topspin Center",
    district: "Long Biên",
    sports: ["badminton", "pickleball"],
    surface: "Sprung timber",
    pricePerHour: 130000,
    distanceKm: 5.1,
    rating: 4.4,
    openSlots: 6,
    nextSlot: "18:00",
    freePct: 51,
  },
  {
    id: "c6",
    name: "Baseline Athletic",
    district: "Hai Bà Trưng",
    sports: ["tennis"],
    surface: "Hard · acrylic",
    pricePerHour: 170000,
    distanceKm: 4.0,
    rating: 4.6,
    openSlots: 4,
    nextSlot: "19:30",
    freePct: 37,
  },
]

/** An open match lobby other players can join (Match Maker). */
export interface MatchRoom {
  id: string
  host: { name: string; initials: string }
  title: string
  /** Resolved court id (set by the session projection). */
  courtId?: string
  sport: SportKey
  format: "Singles" | "Doubles"
  venue: string
  district: string
  distanceKm: number
  day: string
  time: string
  /** Level the room is for (or "any"). A stated preference, not a hard gate. */
  level: RoomLevel
  /** Total seats including the host. */
  capacity: number
  /** Seats already taken. `players` holds their initials. */
  joined: number
  players: string[]
  pricePerHour: number
  /** Set once a court has been booked for this room. */
  bookingId?: string
}

export const ROOMS: MatchRoom[] = [
  {
    id: "r1",
    host: { name: "Trần Huy", initials: "TH" },
    title: "Evening badminton, friendly doubles",
    sport: "badminton",
    format: "Doubles",
    venue: "Shuttle Republic",
    district: "Cầu Giấy",
    distanceKm: 1.2,
    day: "Today",
    time: "18:30 – 19:30",
    level: "intermediate",
    capacity: 4,
    joined: 2,
    players: ["TH", "LL"],
    pricePerHour: 360000,
  },
  {
    id: "r2",
    host: { name: "Phạm Quân", initials: "PQ" },
    title: "Competitive tennis singles",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    district: "Tây Hồ",
    distanceKm: 2.6,
    day: "Today",
    time: "19:00 – 20:00",
    level: "advanced",
    capacity: 2,
    joined: 1,
    players: ["PQ"],
    pricePerHour: 220000,
  },
  {
    id: "r3",
    host: { name: "Đỗ Anh", initials: "ĐA" },
    title: "Casual pickleball rally",
    sport: "pickleball",
    format: "Doubles",
    venue: "Smash Pickleball",
    district: "Đống Đa",
    distanceKm: 0.9,
    day: "Today",
    time: "17:45 – 18:45",
    level: "beginner",
    capacity: 4,
    joined: 3,
    players: ["ĐA", "VH", "BK"],
    pricePerHour: 150000,
  },
  {
    id: "r4",
    host: { name: "Vũ Hà", initials: "VH" },
    title: "Advanced pickleball doubles",
    sport: "pickleball",
    format: "Doubles",
    venue: "Rally Point Club",
    district: "Ba Đình",
    distanceKm: 3.4,
    day: "Today",
    time: "20:15 – 21:15",
    level: "advanced",
    capacity: 4,
    joined: 2,
    players: ["VH", "PQ"],
    pricePerHour: 280000,
  },
  {
    id: "r5",
    host: { name: "Lê Lan", initials: "LL" },
    title: "Badminton doubles night",
    sport: "badminton",
    format: "Doubles",
    venue: "Topspin Center",
    district: "Long Biên",
    distanceKm: 5.1,
    day: "Tomorrow",
    time: "18:00 – 19:00",
    level: "intermediate",
    capacity: 4,
    joined: 4,
    players: ["LL", "BK", "ĐA", "TH"],
    pricePerHour: 130000,
  },
  {
    id: "r6",
    host: { name: "Bùi Khang", initials: "BK" },
    title: "Tennis doubles, all welcome",
    sport: "tennis",
    format: "Doubles",
    venue: "Rally Point Club",
    district: "Ba Đình",
    distanceKm: 3.4,
    day: "Tomorrow",
    time: "19:00 – 20:00",
    level: "any",
    capacity: 4,
    joined: 1,
    players: ["BK"],
    pricePerHour: 280000,
  },
]

/** Preset start times offered when hosting a room. */
export const ROOM_TIME_SLOTS = [
  "Today 18:30 – 19:30",
  "Today 19:30 – 20:30",
  "Today 20:30 – 21:30",
  "Tomorrow 07:00 – 08:00",
  "Tomorrow 19:00 – 20:00",
  "Sat 09:30 – 10:30",
]

export type BookingStatus = "confirmed" | "pending" | "completed" | "cancelled"

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
    sport: "pickleball",
    format: "Doubles",
    venue: "Smash Pickleball",
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

/** Map a stored day word/label to a BOOKING_DAYS key (seed-build use). */
export function dayKeyForRoom(room: { day: string }): string {
  const d = room.day.toLowerCase()
  if (d.startsWith("tomorrow")) return "tomorrow"
  if (d.startsWith("sat")) return "sat"
  if (d.startsWith("sun")) return "sun"
  if (d.startsWith("mon")) return "mon"
  if (d.startsWith("today")) return "today"
  return "past"
}

// ── Play sessions: one entity owning team (who) + booking (court/when) ────────

/** RSVP state of a session participant. */
export type Rsvp = "host" | "going" | "pending" | "declined"

export interface SessionPlayer {
  name: string
  initials: string
  rsvp: Rsvp
  /** Bill-sharing: whether this member has settled their share. */
  paid?: boolean
}

export type SessionStatus = "forming" | "booked" | "completed" | "cancelled"

/**
 * A play session — one entity owning the team (who) and the booking
 * (court/when). It may be *forming* (a lobby with no court held yet), *booked*
 * (a court is held), or historical (completed/cancelled). Both halves are
 * optional: a book-only session has a roster of just the host; a find-only
 * session has no held court. Match Maker and Bookings are projections of this.
 */
export interface PlaySession {
  id: string
  title: string
  sport: SportKey
  format: "Singles" | "Doubles"
  /** Stable court reference (replaces fragile venue-name lookups). */
  courtId: string | null
  /** Canonical BOOKING_DAYS key, or "past" for history (never blocks). */
  dayKey: string
  /** Display label for the day (kept verbatim for "past"/seed history). */
  dayLabel: string
  /** "HH:MM" start — proposed while forming, held once booked. */
  slot: string | null
  /** Cosmetic "Court N", set when a court is booked. */
  courtLabel: string | null
  host: { name: string; initials: string }
  capacity: number
  /** THE roster — counts, seat meter, invites and the bill all read this. */
  roster: SessionPlayer[]
  level: RoomLevel
  status: SessionStatus
  /** Court-hold sub-state once booked (drives the legacy Booking status). */
  hold?: "confirmed" | "pending"
  /** Visible as an open lobby ("room") in Match Maker. */
  listed: boolean
  fillIntent: "court" | "invite" | "find"
  venue: string
  district: string
  distanceKm: number
  pricePerHour: number
  result?: "W" | "L"
  score?: string
}

/** Seats a format implies (host included). */
export const capacityFor = (format: "Singles" | "Doubles") =>
  format === "Singles" ? 2 : 4

/** Stable cosmetic "Court N" label from a court id. */
export function courtNumberFor(courtId: string): string {
  const i = COURTS.findIndex((c) => c.id === courtId)
  return `Court ${i >= 0 ? i + 1 : 1}`
}

/** Parse "HH:MM" to minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Whether two one-hour slots (by "HH:MM" start) overlap. */
function slotsOverlap(a: string, b: string): boolean {
  const x = toMinutes(a)
  const y = toMinutes(b)
  return x < y + 60 && y < x + 60
}

/** Booked sessions that actually hold a court (the only ones that block). */
function courtHolds(sessions: PlaySession[], ignoreId?: string): PlaySession[] {
  return sessions.filter(
    (s) =>
      s.status === "booked" &&
      s.id !== ignoreId &&
      s.courtId != null &&
      s.slot != null &&
      BOOKING_DAYS.some((d) => d.key === s.dayKey)
  )
}

export type Conflict = "court-taken" | "self-overlap" | null

export interface ConflictQuery {
  courtId: string | null
  dayKey: string
  slot: string | null
  /** Session being (re)booked — excluded from the check. */
  ignoreId?: string
}

/**
 * The single conflict predicate, used by both the slot grid and Confirm.
 * Interval-based so off-grid seed/room times (e.g. 18:30, 17:45) correctly
 * block the overlapping on-the-hour tiles. Order: court-taken > self-overlap.
 */
export function conflictFor(
  sessions: PlaySession[],
  q: ConflictQuery
): Conflict {
  if (q.courtId == null || q.slot == null) return null
  if (!BOOKING_DAYS.some((d) => d.key === q.dayKey)) return null
  // (a) house availability for this court/day
  const house = courtSlots(q.courtId, q.dayKey).find((s) => s.time === q.slot)
  if (house?.taken) return "court-taken"
  const holds = courtHolds(sessions, q.ignoreId)
  // (b) another held court at the same venue/day overlapping this slot
  if (
    holds.some(
      (s) =>
        s.courtId === q.courtId &&
        s.dayKey === q.dayKey &&
        slotsOverlap(s.slot!, q.slot!)
    )
  )
    return "court-taken"
  // (c) the user's own held court (any venue) overlapping this slot/day
  if (
    holds.some(
      (s) =>
        s.dayKey === q.dayKey &&
        s.roster.some(
          (p) => p.initials === USER.initials && p.rsvp !== "declined"
        ) &&
        slotsOverlap(s.slot!, q.slot!)
    )
  )
    return "self-overlap"
  return null
}

/** Whether a court/day/slot tile is unavailable (house or any held court). */
export function isSlotTaken(
  sessions: PlaySession[],
  courtId: string,
  dayKey: string,
  slot: string,
  ignoreId?: string
): boolean {
  return conflictFor(sessions, { courtId, dayKey, slot, ignoreId }) !== null
}

/** Active (non-declined) roster members. */
export const activeRoster = (s: PlaySession) =>
  s.roster.filter((p) => p.rsvp !== "declined")

/** Map a roster to the legacy BookingPlayer[] shape (declined dropped). */
function rosterToBookingPlayers(roster: SessionPlayer[]): BookingPlayer[] {
  return roster
    .filter((p) => p.rsvp !== "declined")
    .map((p) => ({
      name: p.name,
      initials: p.initials,
      status: p.rsvp as InviteStatus,
    }))
}

/** Derive the legacy Booking status from a session. */
export function bookingStatusOf(s: PlaySession): BookingStatus {
  if (s.status === "completed") return "completed"
  if (s.status === "cancelled") return "cancelled"
  if (s.status === "booked")
    return s.hold === "pending" ? "pending" : "confirmed"
  return "pending"
}

/** Project a session to the legacy MatchRoom shape (Match Maker / chat). */
export function sessionToRoom(s: PlaySession): MatchRoom {
  const active = activeRoster(s)
  return {
    id: s.id,
    host: s.host,
    title: s.title,
    courtId: s.courtId ?? undefined,
    sport: s.sport,
    format: s.format,
    venue: s.venue,
    district: s.district,
    distanceKm: s.distanceKm,
    day: s.dayLabel,
    time: s.slot ? slotRange(s.slot) : "",
    level: s.level,
    capacity: s.capacity,
    joined: active.length,
    players: active.map((p) => p.initials),
    pricePerHour: s.pricePerHour,
    bookingId: s.status === "booked" ? s.id : undefined,
  }
}

/** Project a session to the legacy Booking shape (Bookings view). */
export function sessionToBooking(s: PlaySession): Booking {
  return {
    id: s.id,
    sport: s.sport,
    format: s.format,
    venue: s.venue,
    court: s.courtLabel ?? (s.courtId ? courtNumberFor(s.courtId) : ""),
    day: s.dayLabel,
    dayKey: BOOKING_DAYS.some((d) => d.key === s.dayKey) ? s.dayKey : undefined,
    time: s.slot ? slotRange(s.slot) : "",
    status: bookingStatusOf(s),
    withPlayers: rosterToBookingPlayers(s.roster),
    roomId: s.listed ? s.id : undefined,
    pricePerHour: s.pricePerHour,
    result: s.result,
    score: s.score,
  }
}

// ── Seed: build the initial sessions from ROOMS + BOOKINGS (SSR-safe) ─────────

/** Explicit day keys for seed bookings (b4/b5 are in the past). */
const SEED_BOOKING_DAYKEY: Record<string, string> = {
  b1: "today",
  b2: "tomorrow",
  b3: "sat",
  b4: "past",
  b5: "past",
}

/** Start ("HH:MM") of a "HH:MM – HH:MM" range. */
function startOf(timeRange: string): string {
  return timeRange.split(" – ")[0] ?? timeRange
}

function bookingToSession(b: Booking): PlaySession {
  const court = courtByVenue(b.venue)
  const status: SessionStatus =
    b.status === "completed"
      ? "completed"
      : b.status === "cancelled"
        ? "cancelled"
        : "booked"
  const host: SessionPlayer = {
    name: USER.name,
    initials: USER.initials,
    rsvp: "host",
  }
  const others: SessionPlayer[] = b.withPlayers.map((p) => ({
    name: p.name,
    initials: p.initials,
    rsvp: p.status === "host" ? "host" : (p.status as Rsvp),
  }))
  return {
    id: b.id,
    title: `${sportLabel(b.sport)} · ${b.venue}`,
    sport: b.sport,
    format: b.format,
    courtId: court?.id ?? null,
    dayKey: SEED_BOOKING_DAYKEY[b.id] ?? "today",
    dayLabel: b.day,
    slot: startOf(b.time),
    courtLabel: b.court,
    host: { name: USER.name, initials: USER.initials },
    capacity: capacityFor(b.format),
    roster: [host, ...others],
    level: USER.level,
    status,
    hold: b.status === "pending" ? "pending" : "confirmed",
    listed: false,
    fillIntent: "court",
    venue: b.venue,
    district: court?.district ?? "",
    distanceKm: court?.distanceKm ?? 0,
    pricePerHour: b.pricePerHour,
    result: b.result,
    score: b.score,
  }
}

function roomToSession(r: MatchRoom): PlaySession {
  const court = courtByVenue(r.venue)
  return {
    id: r.id,
    title: r.title,
    sport: r.sport,
    format: r.format,
    courtId: court?.id ?? null,
    dayKey: dayKeyForRoom(r),
    dayLabel: r.day,
    slot: startOf(r.time),
    courtLabel: null,
    host: r.host,
    capacity: r.capacity,
    roster: r.players.map((init) => {
      const p = playerByInitials(init)
      return {
        name: p.name,
        initials: init,
        rsvp: (init === r.host.initials ? "host" : "going") as Rsvp,
      }
    }),
    level: r.level,
    status: "forming",
    listed: true,
    fillIntent: "find",
    venue: r.venue,
    district: r.district,
    distanceKm: r.distanceKm,
    pricePerHour: r.pricePerHour,
  }
}

/** The initial session list — pure & deterministic (evaluated once). */
export function buildSeedSessions(): PlaySession[] {
  return [...ROOMS.map(roomToSession), ...BOOKINGS.map(bookingToSession)]
}

export const SESSIONS: PlaySession[] = buildSeedSessions()

export interface Chat {
  id: string
  name: string
  initials: string
  last: string
  time: string
  unread: number
  online: boolean
  group: boolean
  /** Member count for group chats (defaults to 4 when omitted). */
  members?: number
}

export const CHATS: Chat[] = [
  {
    id: "ch1",
    name: "Badminton Crew",
    initials: "BC",
    last: "Huy: See you at Court 3 at 6:30 👊",
    time: "12m",
    unread: 2,
    online: true,
    group: true,
  },
  {
    id: "ch2",
    name: "Trần Huy",
    initials: "TH",
    last: "Bring an extra grip if you have one",
    time: "1h",
    unread: 0,
    online: true,
    group: false,
  },
  {
    id: "ch3",
    name: "Lê Lan",
    initials: "LL",
    last: "Confirmed for tonight ✅",
    time: "3h",
    unread: 0,
    online: false,
    group: false,
  },
  {
    id: "ch4",
    name: "Phạm Quân",
    initials: "PQ",
    last: "Rematch this weekend? 🎾",
    time: "Yesterday",
    unread: 0,
    online: false,
    group: false,
  },
]

export interface Message {
  id: string
  mine: boolean
  author: string
  text: string
  time: string
}

export const THREAD: Message[] = [
  {
    id: "m1",
    mine: false,
    author: "Trần Huy",
    text: "Court 3 is booked for tonight 🔥",
    time: "17:42",
  },
  {
    id: "m2",
    mine: false,
    author: "Lê Lan",
    text: "Confirmed for tonight ✅",
    time: "17:45",
  },
  {
    id: "m3",
    mine: true,
    author: "Minh",
    text: "Perfect. I'll warm up the serves 😅",
    time: "17:48",
  },
  {
    id: "m4",
    mine: false,
    author: "Trần Huy",
    text: "See you at Court 3 at 6:30 👊",
    time: "17:51",
  },
]

export const STREAK = {
  current: 6,
  longest: 14,
  weeklyGoal: 5,
  weeklyDone: 4,
  // Last seven days, oldest → today.
  week: [
    { day: "M", active: true, sport: "tennis" as SportKey },
    { day: "T", active: true, sport: "badminton" as SportKey },
    { day: "W", active: false, sport: null },
    { day: "T", active: true, sport: "pickleball" as SportKey },
    { day: "F", active: true, sport: "pickleball" as SportKey },
    { day: "S", active: true, sport: "tennis" as SportKey },
    { day: "S", active: false, sport: null, today: true },
  ] as {
    day: string
    active: boolean
    sport: SportKey | null
    today?: boolean
  }[],
  // 12 weeks × 7 days of activity intensity (0–3) for the heatmap, oldest first.
  history: [
    0, 1, 0, 2, 1, 0, 0, 1, 0, 1, 2, 0, 1, 0, 0, 2, 1, 3, 1, 0, 1, 0, 1, 0, 2,
    0, 1, 1, 1, 0, 2, 1, 0, 1, 2, 0, 0, 1, 0, 2, 1, 1, 2, 0, 1, 3, 1, 0, 2, 1,
    1, 0, 1, 2, 0, 1, 0, 2, 1, 3, 1, 0, 1, 2, 1, 0, 2, 1, 3, 2, 1, 0, 2, 1, 1,
    2, 0, 1, 2, 1, 3, 2, 1, 0,
  ],
}

export const STATS = {
  matches: 48,
  winRate: 67,
  hours: 32,
  hoursDelta: 5,
}

export type ActivityKind = "match-found" | "win" | "loss" | "booking" | "rating"

export interface ActivityItem {
  id: string
  kind: ActivityKind
  text: string
  time: string
}

export const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    kind: "match-found",
    text: "AI matched you with Trần Huy for badminton tonight",
    time: "2h ago",
  },
  {
    id: "a3",
    kind: "win",
    text: "Won doubles at Rally Point Club · 6–3, 6–4",
    time: "3 days ago",
  },
  {
    id: "a4",
    kind: "booking",
    text: "Booked Court 1 at Ace Tennis Club",
    time: "4 days ago",
  },
  {
    id: "a5",
    kind: "loss",
    text: "Close singles loss to Vũ Hà · 4–6, 6–7",
    time: "6 days ago",
  },
]

export type NotificationKind =
  | "match"
  | "chat"
  | "booking"
  | "rating"
  | "streak"

export interface NotificationItem {
  id: string
  kind: NotificationKind
  /** English fallback text; localized seeds live under `Notifications.items`. */
  text: string
  time: string
  read: boolean
  /** In-app destination opened when the notification is clicked. */
  href?: string
  /** Chat to select when clicked (paired with an href to `/dashboard/chat`). */
  chatId?: string
}

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    kind: "chat",
    text: "New message in Badminton Crew",
    time: "12m",
    read: false,
    href: "/dashboard/chat",
    chatId: "ch1",
  },
  {
    id: "n2",
    kind: "match",
    text: "AI matched you with Trần Huy for badminton tonight",
    time: "2h",
    read: false,
    href: "/dashboard/match-maker",
  },
  {
    id: "n3",
    kind: "booking",
    text: "Court 3 at Shuttle Republic confirmed · 18:30",
    time: "5h",
    read: true,
    href: "/dashboard/bookings",
  },
]
