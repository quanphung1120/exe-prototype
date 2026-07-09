// Pure helpers shared by the API and the web app. Helpers that need records
// (courts, the user, the venue) take them as parameters rather than reading a
// module-level constant — the records now live in the API and the web binds
// these to the fetched data in its `DataProvider`.

import {
  BOOKING_DAYS,
  COURT_OPEN_FROM,
  COURT_OPEN_TO,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  LEVEL_ORDER,
  SCHEDULE_HOURS,
  SLOT_TIMES,
  SPORTS,
} from "./config.js"
import type {
  Booking,
  BookingPlayer,
  BookingStatus,
  Conflict,
  ConflictQuery,
  Court,
  InviteStatus,
  Level,
  Localized,
  LocalizedList,
  MatchRoom,
  Player,
  PlaySession,
  RoomLevel,
  RosterEntry,
  Rsvp,
  ScheduleEvent,
  ScheduleSlot,
  SessionPlayer,
  SessionStatus,
  SportKey,
  TrustTier,
  User,
  Venue,
  VenueCourt,
} from "./types.js"

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Two-letter avatar mark from a name: "Ace Pavilion" → "AP", "Quan" → "QU".
 * Single source of truth so the web sidebar and the API venue store can't drift.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Sports ───────────────────────────────────────────────────────────────────

const sportBy = (k: SportKey) => SPORTS.find((s) => s.key === k)
export const sportLabel = (k: SportKey) => sportBy(k)?.label ?? k
export const sportShort = (k: SportKey) => sportBy(k)?.short ?? "??"
export const sportAccent = (k: SportKey) => sportBy(k)?.accent ?? "bg-muted"

// ── Money ────────────────────────────────────────────────────────────────────

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

// ── Levels & trust ───────────────────────────────────────────────────────────

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

/** Bucket a 0–100 trust score into a reputation tier. */
export function trustTier(trust: number): TrustTier {
  if (trust >= 85) return "trusted"
  if (trust >= 70) return "reliable"
  return "new"
}

// ── Time math ────────────────────────────────────────────────────────────────

/** Parse "HH:MM" to minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Add minutes to a "HH:MM" time (wraps within a day), returning "HH:MM". */
export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = ((((h || 0) * 60 + (m || 0) + mins) % 1440) + 1440) % 1440
  const hh = String(Math.floor(total / 60)).padStart(2, "0")
  const mm = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/** A "HH:MM – HH:MM" label for a start + duration (defaults to one hour). */
export function slotRange(start: string, durationMin = 60): string {
  return `${start} – ${addMinutes(start, durationMin)}`
}

/** Signed minutes from one "HH:MM" to another (end − start). */
export function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh || 0) * 60 + (em || 0) - ((sh || 0) * 60 + (sm || 0))
}

/** Minutes spanned by a "HH:MM – HH:MM" range (falls back to 60). */
export function durationOf(timeRange: string): number {
  const [a, b] = timeRange.split(" – ")
  if (!a || !b) return 60
  const d = toMinutes(b) - toMinutes(a)
  return d > 0 ? d : 60
}

/** Prorate an hourly rate over a duration in minutes (VND). */
export function priceFor(pricePerHour: number, durationMin: number): number {
  return Math.round((pricePerHour * durationMin) / 60)
}

/**
 * Percentage slot-holding fee (5%) charged at checkout. Players pay only this to
 * lock in a court; the rest is settled at the venue.
 */
export const HOLD_FEE_PCT = 0.05

/** Compact duration label, e.g. "1h", "1h 30m", "45m". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Start ("HH:MM") of a "HH:MM – HH:MM" range. */
function startOf(timeRange: string): string {
  return timeRange.split(" – ")[0] ?? timeRange
}

/** Whether two intervals (start "HH:MM" + length in minutes) overlap. */
export function rangesOverlap(
  aStart: string,
  aDur: number,
  bStart: string,
  bDur: number
): boolean {
  const x = toMinutes(aStart)
  const y = toMinutes(bStart)
  return x < y + bDur && y < x + aDur
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

// ── Roster ───────────────────────────────────────────────────────────────────

/** Everyone a room's `players` initials can refer to: the user + suggestions. */
export function buildRoster(user: User, players: Player[]): RosterEntry[] {
  return [
    {
      name: user.name,
      initials: user.initials,
      level: user.level,
      trust: user.trust,
    },
    ...players.map((p) => ({
      name: p.name,
      initials: p.initials,
      level: p.level,
      trust: p.trust,
    })),
  ]
}

/** Resolve a room participant's initials to their name, level and trust. */
export function playerByInitials(
  roster: RosterEntry[],
  initials: string
): RosterEntry {
  return (
    roster.find((p) => p.initials === initials) ?? {
      name: initials,
      initials,
      level: "intermediate",
      trust: 70,
    }
  )
}

// ── Courts ───────────────────────────────────────────────────────────────────

/**
 * Deterministic per-court, per-day slot availability. No randomness/Date — the
 * same court + day always yields the same grid, so server and client agree.
 * Lower court `freePct` → more slots taken.
 */
export function courtSlots(
  courts: Court[],
  courtId: string,
  dayKey: string
): { time: string; taken: boolean }[] {
  const freePct = courts.find((c) => c.id === courtId)?.freePct ?? 50
  return SLOT_TIMES.map((time, i) => ({
    time,
    taken: hashStr(`${courtId}:${dayKey}:${i}`) % 100 >= freePct,
  }))
}

/** Resolve a stored venue name back to a Court. */
export function courtByVenue(courts: Court[], name: string): Court | undefined {
  return courts.find((c) => c.name === name)
}

/** Stable cosmetic "Court N" label from a court id. */
export function courtNumberFor(courts: Court[], courtId: string): string {
  const i = courts.findIndex((c) => c.id === courtId)
  return `Court ${i >= 0 ? i + 1 : 1}`
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

// ── Conflict detection ───────────────────────────────────────────────────────

/** Seats a format implies (host included). */
export const capacityFor = (format: "Singles" | "Doubles") =>
  format === "Singles" ? 2 : 4

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

/**
 * The single conflict predicate. Fully interval-based: a free-form request
 * (e.g. 06:40 for 65 min) is checked against the house's taken hours AND any
 * held court, by real time-range overlap — so off-grid starts and arbitrary
 * durations collide correctly. Order: court-taken > self-overlap.
 */
export function conflictFor(
  courts: Court[],
  user: User,
  sessions: PlaySession[],
  q: ConflictQuery
): Conflict {
  if (q.courtId == null || q.slot == null) return null
  if (!BOOKING_DAYS.some((d) => d.key === q.dayKey)) return null
  const dur = q.durationMin || 60
  // (a) house availability — any taken hour overlapping the requested range
  const houseTaken = courtSlots(courts, q.courtId, q.dayKey).filter(
    (s) => s.taken
  )
  if (houseTaken.some((s) => rangesOverlap(q.slot!, dur, s.time, 60)))
    return "court-taken"
  const holds = courtHolds(sessions, q.ignoreId)
  // (b) another held court at the same venue/day overlapping this range
  if (
    holds.some(
      (s) =>
        s.courtId === q.courtId &&
        s.dayKey === q.dayKey &&
        rangesOverlap(q.slot!, dur, s.slot!, s.durationMin)
    )
  )
    return "court-taken"
  // (c) the user's own held court (any venue) overlapping this range/day
  if (
    holds.some(
      (s) =>
        s.dayKey === q.dayKey &&
        s.roster.some(
          (p) => p.initials === user.initials && p.rsvp !== "declined"
        ) &&
        rangesOverlap(q.slot!, dur, s.slot!, s.durationMin)
    )
  )
    return "self-overlap"
  return null
}

/** Whether a court/day range is unavailable (house or any held court). */
export function isSlotTaken(
  courts: Court[],
  user: User,
  sessions: PlaySession[],
  courtId: string,
  dayKey: string,
  slot: string,
  durationMin = 60,
  ignoreId?: string
): boolean {
  return (
    conflictFor(courts, user, sessions, {
      courtId,
      dayKey,
      slot,
      durationMin,
      ignoreId,
    }) !== null
  )
}

// ── Court day calendar (player booking) ──────────────────────────────────────

/** A start ("HH:MM") + length in minutes — a calendar band. */
export interface CourtBand {
  start: string
  durationMin: number
}

/**
 * Merged, sorted busy intervals on a court for a day: the house's already-taken
 * hours (from {@link courtSlots}) plus any confirmed court holds on that
 * court/day. Drives the booking calendar — its free gaps are the complement
 * within the court's open window. Cross-venue self-overlaps are *not* folded in
 * (they belong to the player, not the court) — {@link conflictFor} still warns.
 */
export function courtDayBusy(
  courts: Court[],
  sessions: PlaySession[],
  courtId: string,
  dayKey: string,
  ignoreId?: string
): CourtBand[] {
  if (!BOOKING_DAYS.some((d) => d.key === dayKey)) return []
  const raw: { start: number; end: number }[] = []
  for (const s of courtSlots(courts, courtId, dayKey)) {
    if (s.taken) {
      const start = toMinutes(s.time)
      raw.push({ start, end: start + 60 })
    }
  }
  for (const s of courtHolds(sessions, ignoreId)) {
    if (s.courtId === courtId && s.dayKey === dayKey && s.slot) {
      const start = toMinutes(s.slot)
      raw.push({ start, end: start + s.durationMin })
    }
  }
  raw.sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  return merged.map((m) => ({
    start: addMinutes("00:00", m.start),
    durationMin: m.end - m.start,
  }))
}

/** Free gaps (complement of {@link courtDayBusy}) within the open window. */
export function courtDayGaps(
  courts: Court[],
  sessions: PlaySession[],
  courtId: string,
  dayKey: string,
  ignoreId?: string
): CourtBand[] {
  if (!BOOKING_DAYS.some((d) => d.key === dayKey)) return []
  const openStart = toMinutes(COURT_OPEN_FROM)
  const openEnd = toMinutes(COURT_OPEN_TO)
  const gaps: CourtBand[] = []
  let cursor = openStart
  for (const b of courtDayBusy(courts, sessions, courtId, dayKey, ignoreId)) {
    const s = toMinutes(b.start)
    if (s > cursor)
      gaps.push({ start: addMinutes("00:00", cursor), durationMin: s - cursor })
    cursor = Math.max(cursor, s + b.durationMin)
  }
  if (cursor < openEnd)
    gaps.push({
      start: addMinutes("00:00", cursor),
      durationMin: openEnd - cursor,
    })
  return gaps
}

// ── Session projections ──────────────────────────────────────────────────────

/**
 * Active roster members — confirmed seats. Excludes players who declined and
 * those still {@link pendingRequests awaiting host approval} (a join request
 * doesn't hold a seat until the host approves it).
 */
export const activeRoster = (s: PlaySession) =>
  s.roster.filter((p) => p.rsvp !== "declined" && p.rsvp !== "requested")

/** Players who asked to join and are awaiting the host's approval. */
export const pendingRequests = (s: PlaySession) =>
  s.roster.filter((p) => p.rsvp === "requested")

/** Map a roster to the legacy BookingPlayer[] shape (declined dropped). */
function rosterToBookingPlayers(roster: SessionPlayer[]): BookingPlayer[] {
  return roster
    .filter((p) => p.rsvp !== "declined" && p.rsvp !== "requested")
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
    dayKey: s.dayKey,
    time: s.slot ? slotRange(s.slot, s.durationMin) : "",
    level: s.level,
    capacity: s.capacity,
    joined: active.length,
    players: active.map((p) => p.initials),
    pricePerHour: s.pricePerHour,
    durationMin: s.durationMin,
    bookingId: s.status === "booked" ? s.id : undefined,
  }
}

/** Project a session to the legacy Booking shape (Bookings view). */
export function sessionToBooking(courts: Court[], s: PlaySession): Booking {
  return {
    id: s.id,
    sport: s.sport,
    format: s.format,
    venue: s.venue,
    court: s.courtLabel ?? (s.courtId ? courtNumberFor(courts, s.courtId) : ""),
    day: s.dayLabel,
    dayKey: BOOKING_DAYS.some((d) => d.key === s.dayKey) ? s.dayKey : undefined,
    time: s.slot ? slotRange(s.slot, s.durationMin) : "",
    status: bookingStatusOf(s),
    withPlayers: rosterToBookingPlayers(s.roster),
    roomId: s.listed ? s.id : undefined,
    pricePerHour: s.pricePerHour,
    result: s.result,
    score: s.score,
  }
}

// ── Seed builder (build the initial sessions from ROOMS + BOOKINGS) ───────────

/** Explicit day keys for seed bookings (b4/b5 are in the past). */
const SEED_BOOKING_DAYKEY: Record<string, string> = {
  b1: "today",
  b2: "tomorrow",
  b3: "sat",
  b4: "past",
  b5: "past",
}

function bookingToSession(
  courts: Court[],
  user: User,
  b: Booking
): PlaySession {
  const court = courtByVenue(courts, b.venue)
  const status: SessionStatus =
    b.status === "completed"
      ? "completed"
      : b.status === "cancelled"
        ? "cancelled"
        : "booked"
  const host: SessionPlayer = {
    name: user.name,
    initials: user.initials,
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
    durationMin: durationOf(b.time),
    courtLabel: b.court,
    host: { name: user.name, initials: user.initials },
    capacity: capacityFor(b.format),
    roster: [host, ...others],
    level: user.level,
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

function roomToSession(
  courts: Court[],
  roster: RosterEntry[],
  r: MatchRoom
): PlaySession {
  const court = courtByVenue(courts, r.venue)
  return {
    id: r.id,
    title: r.title,
    sport: r.sport,
    format: r.format,
    courtId: court?.id ?? null,
    dayKey: dayKeyForRoom(r),
    dayLabel: r.day,
    slot: startOf(r.time),
    durationMin: durationOf(r.time),
    courtLabel: null,
    host: r.host,
    capacity: r.capacity,
    roster: r.players.map((init) => {
      const p = playerByInitials(roster, init)
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

/** The initial session list — pure & deterministic (built from rooms + bookings). */
export function buildSeedSessions(
  rooms: MatchRoom[],
  bookings: Booking[],
  courts: Court[],
  user: User,
  players: Player[]
): PlaySession[] {
  const roster = buildRoster(user, players)
  return [
    ...rooms.map((r) => roomToSession(courts, roster, r)),
    ...bookings.map((b) => bookingToSession(courts, user, b)),
  ]
}

// ── Venue: localized content ─────────────────────────────────────────────────

/** Pick the active-locale string from a {@link Localized} pair. */
export const locStr = (l: Localized, locale: string) =>
  locale === "vi" ? l.vi : l.en
/** Pick the active-locale array from a {@link LocalizedList} pair. */
export const locList = (l: LocalizedList, locale: string) =>
  locale === "vi" ? l.vi : l.en

// ── Venue: risk ──────────────────────────────────────────────────────────────

/** Bucket an AI no-show probability into a risk tier. */
export function riskTier(risk: number): "low" | "medium" | "high" {
  if (risk >= 50) return "high"
  if (risk >= 20) return "medium"
  return "low"
}

// ── Venue: schedule generators ───────────────────────────────────────────────

const SCHED_NAMES = [
  "Trần Huy",
  "Lê Lan",
  "Phạm Quân",
  "Đỗ Anh",
  "Vũ Hà",
  "Bùi Khang",
  "Ngô Sơn",
  "Đặng Thu",
  "Hồ Nam",
  "Lý Mai",
]

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
const toHHMM = (min: number) => {
  const x = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(
    x % 60
  ).padStart(2, "0")}`
}
const eventsOverlap = (aS: number, aD: number, bS: number, bD: number) =>
  aS < bS + bD && bS < aS + aD
const hourIndex = (hour: string) => SCHEDULE_HOURS.indexOf(hour)

/** Resolve a venue court by id. */
export const courtById = (courts: VenueCourt[], id: string) =>
  courts.find((c) => c.id === id)

/**
 * Deterministic calendar events for a court on a day: variable-length blocks
 * with gaps and off-the-hour starts, denser toward the evening peak. A
 * maintenance court is a single all-day block. Same court + day → same schedule
 * (no Date/random), so server and client renders agree.
 */
export function courtDayEvents(
  venue: Venue,
  courts: VenueCourt[],
  courtId: string,
  dayKey: string
): ScheduleEvent[] {
  const court = courtById(courts, courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const open = minutesOf(venue.openFrom)
  const close = minutesOf(venue.openTo)
  const now = minutesOf(venue.now)
  const isToday = dayKey === "today"

  if (court?.state === "maintenance") {
    return [
      {
        id: `${courtId}-maint`,
        courtId,
        start: venue.openFrom,
        durationMin: close - open,
        kind: "blocked",
        sport,
        past: isToday && close <= now,
      },
    ]
  }

  const events: ScheduleEvent[] = []
  let cursor = open
  let guard = 0
  while (cursor < close - 30 && guard < 48) {
    guard++
    const h = hashStr(`${courtId}:${dayKey}:${cursor}:${guard}`)
    const evening = cursor >= minutesOf("17:00")
    // Leading gap (free time) — rarer in the evening peak.
    if (h % 100 < (evening ? 22 : 52)) {
      cursor += 30 + (h % 3) * 30 // 30 / 60 / 90 min gap
      continue
    }
    const pool = evening ? [60, 75, 90, 90, 120] : [45, 60, 60, 90]
    // Unsigned shift: hashStr is a uint32, so a signed >> can go negative for
    // h ≥ 2³¹ → negative index → undefined dur → NaN block height (and a NaN
    // cursor that silently truncates the rest of the day).
    let dur = pool[(h >>> 3) % pool.length]
    if (cursor + dur > close) dur = close - cursor
    if (dur < 30) break
    const walkIn = h % 13 === 0
    events.push({
      id: `${courtId}-${cursor}`,
      courtId,
      start: toHHMM(cursor),
      durationMin: dur,
      kind: walkIn ? "walk-in" : "booked",
      customer: SCHED_NAMES[(h >>> 5) % SCHED_NAMES.length],
      sport,
      party: sport === "pickleball" ? 4 : 2 + (h % 3),
      past: isToday && cursor + dur <= now,
    })
    cursor += dur + (h % 4 === 0 ? 15 : 0) // occasional turnover buffer
  }
  return events
}

/** Calendar events for every court, in `courts` order. */
export function venueEventsFor(
  venue: Venue,
  courts: VenueCourt[],
  dayKey: string
): ScheduleEvent[][] {
  return courts.map((c) => courtDayEvents(venue, courts, c.id, dayKey))
}

/**
 * Hour-tile view of a court's day, DERIVED from {@link courtDayEvents} so the
 * legacy grid, the copilot's free-slot search and the calendar all agree: an
 * hour reads booked/walk-in/blocked when an event overlaps it, else free.
 */
export function courtDaySlots(
  venue: Venue,
  courts: VenueCourt[],
  courtId: string,
  dayKey: string
): ScheduleSlot[] {
  const court = courtById(courts, courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const events = courtDayEvents(venue, courts, courtId, dayKey)
  const nowIdx = hourIndex(venue.now)
  return SCHEDULE_HOURS.map((hour, i) => {
    const past = dayKey === "today" && i < nowIdx
    const ev = events.find((e) =>
      eventsOverlap(minutesOf(hour), 60, minutesOf(e.start), e.durationMin)
    )
    if (!ev) return { courtId, hour, kind: "free", sport, past }
    return {
      courtId,
      hour,
      kind: ev.kind,
      customer: ev.customer,
      sport,
      party: ev.party,
      past,
    }
  })
}

/** The full hour grid: one row of slots per court, in `courts` order. */
export function venueScheduleFor(
  venue: Venue,
  courts: VenueCourt[],
  dayKey: string
): ScheduleSlot[][] {
  return courts.map((c) => courtDaySlots(venue, courts, c.id, dayKey))
}

// ── Venue: derived analytics ─────────────────────────────────────────────────

/**
 * 7 days × {@link HEATMAP_HOURS} utilization intensities, 0–100, seeded per
 * venue so each venue's heatmap differs (it used to be a single module-level
 * constant, so every venue — including brand-new empty ones — showed the
 * flagship's pattern). Callers should show a zeroed grid for venues with no
 * activity rather than a fabricated one.
 */
export function utilizationHeatmap(seed: string): number[][] {
  return HEATMAP_DAYS.map((_, d) =>
    HEATMAP_HOURS.map((h, i) => {
      const peak = i >= 4 // 16:00+
      const weekend = d >= 5
      const base = peak ? 70 : 30
      const v = base + (weekend ? 18 : 0) + (hashStr(`${seed}:${d}:${h}`) % 26)
      return Math.min(100, v)
    })
  )
}
