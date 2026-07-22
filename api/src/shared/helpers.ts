// Pure helpers shared by the API and the web app. Helpers that need records
// (courts, the user, the venue) take them as parameters rather than reading a
// module-level constant — the records now live in the API and the web binds
// these to the fetched data in its `DataProvider`.

import {
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
  BookingRecordStatus,
  BookingSource,
  BookingStatus,
  ChannelMixPoint,
  Conflict,
  ConflictQuery,
  Court,
  CourtBlock,
  InviteStatus,
  Level,
  Localized,
  LocalizedList,
  MatchRoom,
  PeakHourPoint,
  Player,
  PlaySession,
  Reservation,
  RevenuePoint,
  RoomLevel,
  RosterEntry,
  Rsvp,
  ScheduleEvent,
  ScheduleSlot,
  SessionPlayer,
  SessionStatus,
  SportKey,
  SportMixPoint,
  TrustTier,
  User,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueStats,
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

// ── Real dates (Asia/Ho_Chi_Minh, fixed +07:00, no DST) ─────────────────────
//
// `dayKey` is a real ISO date ("YYYY-MM-DD") everywhere — for a session/
// reservation/room/booking, a date before "today" is history and never blocks
// (no more "past" string sentinel). These helpers are the only place real
// calendar dates are computed; everything else stays on "HH:MM" arithmetic.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const pad2 = (n: number) => String(n).padStart(2, "0")

/** A UTC `Date` for an ISO day (midnight) — internal; callers stay on strings. */
function asUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/**
 * Server "now" as an ISO datetime with a fixed `+07:00` offset. Only ever
 * called server-side (`seed.service.ts`) — the web renders off the resulting
 * `Seed.serverNow` anchor, never `Date.now()` directly (repo rule).
 */
export function vnNowIso(): string {
  return vnIsoOf(Date.now())
}

/** ISO datetime (+07:00) for an arbitrary epoch-ms instant — internal. */
function vnIsoOf(epochMs: number): string {
  const vn = new Date(epochMs + VN_OFFSET_MS)
  const time = `${pad2(vn.getUTCHours())}:${pad2(vn.getUTCMinutes())}:${pad2(vn.getUTCSeconds())}`
  return `${vn.getUTCFullYear()}-${pad2(vn.getUTCMonth() + 1)}-${pad2(vn.getUTCDate())}T${time}+07:00`
}

/**
 * `iso` shifted by `mins` (may be negative), formatted the same as
 * `vnNowIso`/`combineDateTime` (fixed `+07:00` offset). Used for server-computed
 * deadlines derived from a real instant — e.g. a booking hold's
 * `now + 20min` (`bookings.service.ts#createHold`).
 */
export function addMinutesToIso(iso: string, mins: number): string {
  return vnIsoOf(new Date(iso).getTime() + mins * 60_000)
}

/** "YYYY-MM-DD" (Asia/Ho_Chi_Minh) for an arbitrary epoch-ms instant. */
const vnDateOf = (epochMs: number) => isoDateOf(vnIsoOf(epochMs))

/** The "YYYY-MM-DD" date part of an ISO datetime (or an already-bare date). */
export const isoDateOf = (iso: string) => iso.slice(0, 10)

/** The "HH:MM" time part of an ISO datetime (from the "T" separator). */
export function isoToHHMM(iso: string): string {
  const t = iso.split("T")[1]
  return t ? t.slice(0, 5) : "00:00"
}

/** Add (or subtract) whole days to an ISO date ("YYYY-MM-DD"). */
export function addDaysIso(dateIso: string, n: number): string {
  const dt = asUtcDate(dateIso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** JS weekday of an ISO date, 0 = Sunday … 6 = Saturday. */
function weekdayOf(dateIso: string): number {
  return asUtcDate(dateIso).getUTCDay()
}

/** The first ISO date strictly after `fromIso` whose weekday is `dow` (0–6). */
export function nextWeekdayIso(fromIso: string, dow: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDaysIso(fromIso, i)
    if (weekdayOf(d) === dow) return d
  }
  return fromIso
}

/** Combine a "YYYY-MM-DD" date + "HH:MM" time into an ISO datetime (+07:00). */
export function combineDateTime(dateIso: string, hhmm: string): string {
  return `${dateIso}T${hhmm}:00+07:00`
}

/** Mon-first weekday short label (reuses the heatmap's localized weekday names). */
export function weekdayLabel(dateIso: string): Localized {
  const mondayIndex = (weekdayOf(dateIso) + 6) % 7
  return HEATMAP_DAYS[mondayIndex]
}

/**
 * Display label for a real date relative to "today": "Hôm nay"/"Ngày mai" for
 * the next two days, else a "{weekday}, {dd}/{mm}" fallback (also used for
 * history — a date safely in the past never collides with "today"/"tomorrow").
 */
export function dayLabelFor(dateIso: string, todayIso: string): Localized {
  if (dateIso === todayIso) return { en: "Today", vi: "Hôm nay" }
  if (dateIso === addDaysIso(todayIso, 1))
    return { en: "Tomorrow", vi: "Ngày mai" }
  const wd = weekdayLabel(dateIso)
  const [, m, d] = dateIso.split("-")
  return { en: `${wd.en}, ${d}/${m}`, vi: `${wd.vi}, ${d}/${m}` }
}

/** A sliding N-day bookable window anchored on `todayIso` (default 7 days). */
export function bookingDays(
  todayIso: string,
  days = 7
): { key: string; label: Localized }[] {
  return Array.from({ length: days }, (_, i) => {
    const key = addDaysIso(todayIso, i)
    return { key, label: dayLabelFor(key, todayIso) }
  })
}

/** Same sliding window, named for the venue schedule/reservations day strip. */
export const venueDays = bookingDays

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

/** Map a stored day word/label to a real ISO date off `todayIso` (seed-build use). */
export function dayKeyForRoom(room: { day: string }, todayIso: string): string {
  const d = room.day.toLowerCase()
  if (d.startsWith("tomorrow")) return addDaysIso(todayIso, 1)
  if (d.startsWith("sat")) return nextWeekdayIso(todayIso, 6)
  if (d.startsWith("sun")) return nextWeekdayIso(todayIso, 0)
  if (d.startsWith("mon")) return nextWeekdayIso(todayIso, 1)
  if (d.startsWith("today")) return todayIso
  return addDaysIso(todayIso, -14)
}

// ── Conflict detection ───────────────────────────────────────────────────────

/** Seats a format implies (host included). */
export const capacityFor = (format: "Singles" | "Doubles") =>
  format === "Singles" ? 2 : 4

/**
 * Sessions that actually hold a court and block others: `booked` sessions,
 * plus `forming` sessions with an active (unexpired) court hold — see
 * {@link PlaySession.holdExpiresAt}. A `forming` session with a court/slot but
 * no `holdExpiresAt` (e.g. a legacy invite room) doesn't block — only an
 * explicit, timed hold does.
 */
function courtHolds(
  sessions: PlaySession[],
  ignoreId?: string,
  now: number = Date.now()
): PlaySession[] {
  const todayIso = vnDateOf(now)
  return sessions.filter(
    (s) =>
      s.id !== ignoreId &&
      s.courtId != null &&
      s.slot != null &&
      s.dayKey >= todayIso &&
      (s.status === "booked" ||
        (s.status === "forming" &&
          s.holdExpiresAt != null &&
          s.holdExpiresAt > now))
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
  q: ConflictQuery,
  now: number = Date.now()
): Conflict {
  if (q.courtId == null || q.slot == null) return null
  if (q.dayKey < vnDateOf(now)) return null
  const dur = q.durationMin || 60
  // (a) house availability — any taken hour overlapping the requested range
  const houseTaken = courtSlots(courts, q.courtId, q.dayKey).filter(
    (s) => s.taken
  )
  if (houseTaken.some((s) => rangesOverlap(q.slot!, dur, s.time, 60)))
    return "court-taken"
  const holds = courtHolds(sessions, q.ignoreId, now)
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
  ignoreId?: string,
  now: number = Date.now()
): boolean {
  return (
    conflictFor(
      courts,
      user,
      sessions,
      {
        courtId,
        dayKey,
        slot,
        durationMin,
        ignoreId,
      },
      now
    ) !== null
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
  ignoreId?: string,
  now: number = Date.now()
): CourtBand[] {
  if (dayKey < vnDateOf(now)) return []
  const raw: { start: number; end: number }[] = []
  for (const s of courtSlots(courts, courtId, dayKey)) {
    if (s.taken) {
      const start = toMinutes(s.time)
      raw.push({ start, end: start + 60 })
    }
  }
  for (const s of courtHolds(sessions, ignoreId, now)) {
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
  ignoreId?: string,
  now: number = Date.now()
): CourtBand[] {
  if (dayKey < vnDateOf(now)) return []
  const openStart = toMinutes(COURT_OPEN_FROM)
  const openEnd = toMinutes(COURT_OPEN_TO)
  const gaps: CourtBand[] = []
  let cursor = openStart
  for (const b of courtDayBusy(
    courts,
    sessions,
    courtId,
    dayKey,
    ignoreId,
    now
  )) {
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
    demo: s.demo,
  }
}

/** Project a session to the legacy Booking shape (Bookings view). */
export function sessionToBooking(courts: Court[], s: PlaySession): Booking {
  return {
    id: s.id,
    sport: s.sport,
    venue: s.venue,
    court: s.courtLabel ?? (s.courtId ? courtNumberFor(courts, s.courtId) : ""),
    day: s.dayLabel,
    dayKey: s.dayKey,
    time: s.slot ? slotRange(s.slot, s.durationMin) : "",
    status: bookingStatusOf(s),
    withPlayers: rosterToBookingPlayers(s.roster),
    roomId: s.listed ? s.id : undefined,
    pricePerHour: s.pricePerHour,
    declineReason: s.cancelReason,
    refunded: s.refunded,
    result: s.result,
    score: s.score,
  }
}

// ── Seed builder (build the initial sessions from ROOMS + BOOKINGS) ───────────

/** Explicit real-date offsets for seed bookings, anchored on `todayIso` (b4/b5 land in the past). */
const SEED_BOOKING_DAYKEY: Record<string, (todayIso: string) => string> = {
  b1: (t) => t,
  b2: (t) => addDaysIso(t, 1),
  b3: (t) => nextWeekdayIso(t, 6),
  b4: (t) => addDaysIso(t, -3),
  b5: (t) => addDaysIso(t, -7),
}

function bookingToSession(
  courts: Court[],
  user: User,
  b: Booking,
  todayIso: string
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
    // Bookings no longer carry a singles/doubles format; a booked session
    // defaults to a full (doubles-sized) court so rooms/invites still fit.
    format: "Doubles",
    courtId: court?.id ?? null,
    dayKey: (SEED_BOOKING_DAYKEY[b.id] ?? ((t: string) => t))(todayIso),
    dayLabel: b.day,
    slot: startOf(b.time),
    durationMin: durationOf(b.time),
    courtLabel: b.court,
    host: { name: user.name, initials: user.initials },
    capacity: capacityFor("Doubles"),
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
  r: MatchRoom,
  todayIso: string
): PlaySession {
  const court = courtByVenue(courts, r.venue)
  return {
    id: r.id,
    title: r.title,
    sport: r.sport,
    format: r.format,
    courtId: court?.id ?? null,
    dayKey: dayKeyForRoom(r, todayIso),
    dayLabel: r.day,
    slot: startOf(r.time),
    durationMin: durationOf(r.time),
    courtLabel: null,
    host: r.host,
    capacity: r.capacity,
    roster: r.players.map((init): SessionPlayer => {
      const p = playerByInitials(roster, init)
      return {
        name: p.name,
        initials: init,
        rsvp: init === r.host.initials ? "host" : "going",
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
    demo: r.demo,
  }
}

/** The initial session list — pure & deterministic (built from rooms + bookings). */
export function buildSeedSessions(
  rooms: MatchRoom[],
  bookings: Booking[],
  courts: Court[],
  user: User,
  players: Player[],
  todayIso: string
): PlaySession[] {
  const roster = buildRoster(user, players)
  return [
    ...rooms.map((r) => roomToSession(courts, roster, r, todayIso)),
    ...bookings.map((b) => bookingToSession(courts, user, b, todayIso)),
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
 *
 * `fillerEnabled` (default true) gates only the fabricated busy blocks below —
 * a real court's `maintenance` status still renders (it's genuine operator
 * data, not filler). Venues with a real operator (`info.ownerId`) pass `false`
 * so the schedule shows an honest empty grid instead of invented bookings; the
 * caller still overlays real reservations on top regardless.
 */
export function courtDayEvents(
  venue: Venue,
  courts: VenueCourt[],
  courtId: string,
  dayKey: string,
  todayIso: string,
  fillerEnabled = true
): ScheduleEvent[] {
  const court = courtById(courts, courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const open = minutesOf(venue.openFrom)
  const close = minutesOf(venue.openTo)
  const now = minutesOf(venue.now)
  const isToday = dayKey === todayIso

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

  if (!fillerEnabled) return []

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
      party: 2 + (h % 3),
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
  dayKey: string,
  todayIso: string
): ScheduleEvent[][] {
  return courts.map((c) =>
    courtDayEvents(venue, courts, c.id, dayKey, todayIso)
  )
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
  dayKey: string,
  todayIso: string
): ScheduleSlot[] {
  const court = courtById(courts, courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const events = courtDayEvents(venue, courts, courtId, dayKey, todayIso)
  const nowIdx = hourIndex(venue.now)
  return SCHEDULE_HOURS.map((hour, i) => {
    const past = dayKey === todayIso && i < nowIdx
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
  dayKey: string,
  todayIso: string
): ScheduleSlot[][] {
  return courts.map((c) => courtDaySlots(venue, courts, c.id, dayKey, todayIso))
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

// ── Unified court catalog (venue courts → discovery courts) ───────────────────

/** Default map centre (Hà Nội) for venues seeded without coordinates. */
const HANOI_CENTRE = { lat: 21.0278, lng: 105.8342 }

/**
 * Project one operator {@link VenueCourt} to a discovery {@link Court} so the
 * player-side finder/map and the venue operator read ONE court catalog: the id
 * stays `vc*` (so a booking's `courtId` resolves back to the owning venue), the
 * name pairs the venue and court, and the map/finder-only fields are derived
 * deterministically from the venue + court (no Date/random, so SSR agrees).
 */
export function venueCourtToCourt(venue: Venue, court: VenueCourt): Court {
  const h = hashStr(`${venue.id}:${court.id}`)
  // ±0.005° so a venue's courts don't stack on one exact marker.
  const jitter = (n: number) => ((n % 200) - 100) / 20000
  const freePct = Math.max(0, Math.min(100, 100 - court.utilToday))
  return {
    id: court.id,
    name: `${venue.name} · ${court.name}`,
    district: venue.district,
    city: venue.city,
    sports: [court.sport],
    surface: court.surface,
    pricePerHour: court.pricePerHour,
    distanceKm: Math.round((1 + (h % 90) / 10) * 10) / 10,
    rating: venue.rating,
    openSlots: Math.round((freePct / 100) * SLOT_TIMES.length),
    nextSlot: SLOT_TIMES[h % SLOT_TIMES.length],
    freePct,
    lat: (venue.lat ?? HANOI_CENTRE.lat) + jitter(h),
    lng: (venue.lng ?? HANOI_CENTRE.lng) + jitter(h >>> 7),
  }
}

// ── Booking state machine ────────────────────────────────────────────────────

/**
 * Legal {@link BookingRecordStatus} transitions — one table drives both the API
 * guard (`bookings.service.ts#updateStatus`) and web button states (reservation
 * actions, hold/status badges). `completed`/`cancelled`/`no-show`/`expired` are
 * terminal (no outgoing edges). Replaces the Phase-0 `RESERVATION_TRANSITIONS`
 * table now that reservations are a projection of `BookingRecord`s.
 */
export const BOOKING_TRANSITIONS: Record<
  BookingRecordStatus,
  BookingRecordStatus[]
> = {
  // "pending" here means paid, awaiting venue approval; a sweeper auto-confirm
  // (silence = consent) also lands on "confirmed" through this same edge.
  awaiting_payment: ["pending", "expired", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked-in", "cancelled", "no-show"],
  "checked-in": ["completed", "cancelled"],
  completed: [],
  expired: [],
  cancelled: [],
  "no-show": [],
}

/** A same-status transition is always allowed (idempotent no-op). */
export function canTransitionBooking(
  from: BookingRecordStatus,
  to: BookingRecordStatus
): boolean {
  return from === to || BOOKING_TRANSITIONS[from].includes(to)
}

// ── Venue: analytics computed from real reservations (hybrid) ─────────────────

/** A reservation's ISO date; empty string (never "today") when legacy data lacks one. */
function reservationDay(reservation: Reservation): string {
  return reservation.dayKey ?? ""
}

function reservationMinutes(reservation: Reservation): number {
  if (reservation.durationMin) return reservation.durationMin
  const [start, end] = reservation.time.match(/(\d{2}:\d{2})/g) ?? []
  if (!start || !end) return 60
  return Math.max(15, diffMinutes(start, end))
}

/**
 * Recompute the four KPIs that now have a real source of truth from the venue's
 * reservation records — revenue (today's confirmed/completed), utilization
 * (booked court-minutes ÷ open court-minutes), no-show rate and new customers —
 * leaving every other stat (occupancy, deltas, …) at its seeded value. Pure so
 * the operator bundle can override `stats` before serving.
 */
export function computeVenueStats(
  info: Venue,
  courts: VenueCourt[],
  reservations: Reservation[],
  base: VenueStats,
  todayIso: string
): VenueStats {
  const CONFIRMED = new Set(["confirmed", "completed", "checked-in"])
  const today = reservations.filter((r) => reservationDay(r) === todayIso)

  const revenueToday = today
    .filter((r) => r.status === "confirmed" || r.status === "completed")
    .reduce((sum, r) => sum + r.price, 0)

  const openMinutes = Math.max(
    1,
    (toMinutes(info.openTo) - toMinutes(info.openFrom)) *
      Math.max(1, courts.length)
  )
  const bookedMinutes = today
    .filter((r) => CONFIRMED.has(r.status))
    .reduce((sum, r) => sum + reservationMinutes(r), 0)
  const utilization = Math.min(
    100,
    Math.round((bookedMinutes / openMinutes) * 100)
  )

  const counted = reservations.filter(
    (r) =>
      r.status === "no-show" ||
      r.status === "completed" ||
      r.status === "checked-in"
  )
  const noShows = counted.filter((r) => r.status === "no-show").length
  const noShowRate = counted.length
    ? Math.round((noShows / counted.length) * 100)
    : 0

  // New app bookers (distinct userId) + new walk-ins (distinct phone).
  const newIds = new Set<string>()
  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "no-show") continue
    const key = r.userId ?? r.customer.phone
    if (key) newIds.add(key)
  }

  return {
    ...base,
    revenueToday,
    utilization,
    noShowRate,
    newCustomers: newIds.size,
  }
}

// ── Venue: full analytics computed from real reservations (owned venues) ────
//
// `computeVenueStats` above overrides just the four hybrid KPIs. The
// functions below go further and recompute the *chart series* themselves —
// used only for venues with a real operator (`info.ownerId`); demo venues
// keep their curated, hardcoded series (see `VenuesService.withComputedStats`).

/** A reservation's "HH:MM" start, falling back to parsing the legacy `time` range. */
function reservationStart(reservation: Reservation): string | null {
  if (reservation.start) return reservation.start
  const [start] = reservation.time.match(/(\d{2}:\d{2})/g) ?? []
  return start ?? null
}

/** A reservation that actually happened (or is still live) — excludes declines. */
function isLiveBooking(reservation: Reservation): boolean {
  return reservation.status !== "cancelled"
}

const BOOKING_SOURCES: BookingSource[] = ["app", "walk-in"]

/** The last 7 calendar dates ending `todayIso` (oldest → today), "YYYY-MM-DD". */
function last7DaysIso(todayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(todayIso, i - 6))
}

/**
 * Real weekday labels (oldest → today) for the last-7-day window ending
 * `todayIso` — labels {@link computeUtilizationHeatmap}'s rows so a real
 * venue's heatmap reads its actual weekdays instead of the demo's fixed
 * Mon–Sun axis (which isn't anchored to real dates).
 */
export function heatmapRowLabels(todayIso: string): Localized[] {
  return last7DaysIso(todayIso).map(weekdayLabel)
}

/** Real last-7-day revenue (oldest → today), VND, from a venue's own reservations. */
export function computeRevenueSeries(
  reservations: Reservation[],
  todayIso: string
): RevenuePoint[] {
  return last7DaysIso(todayIso).map((dateIso) => {
    const value = reservations
      .filter(
        (r) =>
          reservationDay(r) === dateIso &&
          (r.status === "confirmed" || r.status === "completed")
      )
      .reduce((sum, r) => sum + r.price, 0)
    return { label: weekdayLabel(dateIso), value }
  })
}

/** Real share of live bookings per sport, from a venue's own reservations. */
export function computeSportMix(reservations: Reservation[]): SportMixPoint[] {
  const live = reservations.filter(isLiveBooking)
  const bySport = new Map<SportKey, number>()
  for (const r of live) bySport.set(r.sport, (bySport.get(r.sport) ?? 0) + 1)
  const total = live.length
  return [...bySport.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sport, bookings]) => ({
      sport,
      bookings,
      pct: total ? Math.round((bookings / total) * 100) : 0,
    }))
}

/** Real app-vs-walk-in split of live bookings, from a venue's own reservations. */
export function computeChannelMix(
  reservations: Reservation[]
): ChannelMixPoint[] {
  const live = reservations.filter(isLiveBooking)
  const total = live.length
  return BOOKING_SOURCES.map((source) => {
    const count = live.filter((r) => r.source === source).length
    return { source, pct: total ? Math.round((count / total) * 100) : 0 }
  })
}

/**
 * Real busiest hours: for each hour on the schedule grid, the share of the
 * venue's courts with a live, non-cancelled reservation overlapping it — the
 * top 4, busiest first. From a venue's own reservations, no fabrication.
 */
export function computePeakHours(
  courts: VenueCourt[],
  reservations: Reservation[]
): PeakHourPoint[] {
  const live = reservations.filter(isLiveBooking)
  const totalCourts = Math.max(1, courts.length)
  return SCHEDULE_HOURS.map((hour) => {
    const occupiedCourts = new Set<string>()
    for (const r of live) {
      const start = reservationStart(r)
      if (!start) continue
      if (rangesOverlap(hour, 60, start, reservationMinutes(r))) {
        occupiedCourts.add(r.courtId ?? r.court)
      }
    }
    return { hour, util: Math.round((occupiedCourts.size / totalCourts) * 100) }
  })
    .sort((a, b) => b.util - a.util)
    .slice(0, 4)
}

/**
 * Real 7-day × {@link HEATMAP_HOURS} utilization grid (oldest → today; pair
 * with {@link heatmapRowLabels} for row labels) — share of the venue's courts
 * with a live reservation overlapping each 2-hour column, from the venue's
 * own reservations. Counterpart to the seeded, hash-based
 * {@link utilizationHeatmap} used for demo venues.
 */
export function computeUtilizationHeatmap(
  courts: VenueCourt[],
  reservations: Reservation[],
  todayIso: string
): number[][] {
  const live = reservations.filter(isLiveBooking)
  const totalCourts = Math.max(1, courts.length)
  return last7DaysIso(todayIso).map((dateIso) => {
    const dayReservations = live.filter((r) => reservationDay(r) === dateIso)
    return HEATMAP_HOURS.map((hh) => {
      const hour = `${hh}:00`
      const occupiedCourts = new Set<string>()
      for (const r of dayReservations) {
        const start = reservationStart(r)
        if (!start) continue
        if (rangesOverlap(hour, 120, start, reservationMinutes(r))) {
          occupiedCourts.add(r.courtId ?? r.court)
        }
      }
      return Math.round((occupiedCourts.size / totalCourts) * 100)
    })
  })
}

// ── Venue: CRM customer stats computed from real bookings (Phase 6) ───────────

/** A CRM customer matches a reservation by linked account, else by phone. */
function reservationMatchesCustomer(
  reservation: Reservation,
  customer: VenueCustomer
): boolean {
  if (customer.userId) return reservation.userId === customer.userId
  return (
    !!reservation.customer.phone && reservation.customer.phone === customer.id
  )
}

/**
 * Tier purely from completion history — no time dimension (no "last visit"
 * clock), so this stays a pure function of the customer's own record: a
 * sharply declining `trend` (kept at whatever value the caller last set,
 * itself out of scope for this derivation) reads as "at-risk" ahead of the
 * visit-count bands, mirroring the flagship seed's Vũ Hà (27 visits, trend
 * -34 → "at-risk" despite a "regular"-sized visit count).
 */
function tierFor(visits: number, trend: number): VenueCustomer["tier"] {
  if (trend <= -20) return "at-risk"
  if (visits >= 40) return "vip"
  if (visits >= 10) return "regular"
  return "new"
}

/**
 * Recompute each customer's `visits`/`ltv`/`noShowRate`/`tier` from the venue's
 * real reservations — VienTD-Review decision #15/default: "visits/LTV recompute
 * từ reservation completed". Pure and read-time-only (no write hook), so a
 * customer created by `upsertWalkInCustomer`/`upsertAppCustomer` at zeroed
 * stats is always consistent with its bookings without any completion-time
 * mutation. `lastVisit`/`trend` are left as stored — this only touches the
 * four fields with a real derivation.
 */
export function computeCustomerStats(
  customers: VenueCustomer[],
  reservations: Reservation[]
): VenueCustomer[] {
  return customers.map((customer) => {
    const own = reservations.filter((r) =>
      reservationMatchesCustomer(r, customer)
    )
    const completed = own.filter((r) => r.status === "completed")
    const visits = completed.length
    const ltv = completed.reduce((sum, r) => sum + r.price, 0)
    const counted = own.filter(
      (r) =>
        r.status === "completed" ||
        r.status === "checked-in" ||
        r.status === "no-show"
    )
    const noShows = counted.filter((r) => r.status === "no-show").length
    const noShowRate = counted.length
      ? Math.round((noShows / counted.length) * 100)
      : 0
    return {
      ...customer,
      visits,
      ltv,
      noShowRate,
      tier: tierFor(visits, customer.trend),
    }
  })
}

// ── Venue: court blocks (Phase 6, decision #12) ────────────────────────────────

/**
 * True when a proposed slot on `courtId`/`dateKey` overlaps any block in
 * `blocks` — a real `CourtBlock` entity, not the old per-court `maintenance`
 * flag. Pure so both the API's booking/walk-in creation guards and the web's
 * schedule-grid block overlay (`blockDayEvents`) share one definition of
 * "blocked".
 */
export function overlapsBlock(
  blocks: CourtBlock[],
  courtId: string,
  dateKey: string,
  start: string,
  durationMin: number
): boolean {
  return blocks.some(
    (b) =>
      b.courtId === courtId &&
      b.dateKey === dateKey &&
      rangesOverlap(start, durationMin, b.start, b.durationMin)
  )
}
