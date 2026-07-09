// Calendar date helpers — pure, SSR-deterministic date math for the Bookings
// calendar's Day / Week / Month views.
//
// The prototype has no real clock: every record is keyed off relative day words
// ("today" / "tomorrow" / "sat" / "sun" / "mon"). To draw a real week or month
// we anchor those words to ONE fixed date and do plain UTC arithmetic from
// there — so the server and client always compute the same grid (no `Date.now`
// or local-timezone drift in render).

export type CalendarView = "day" | "week" | "month"

/** The fixed "today". Matches the rest of the app's relative day labels. */
export const TODAY_ISO = "2026-06-22"

// ── Core ISO ("YYYY-MM-DD") math, all in UTC ─────────────────────────────────

/** A UTC Date for an ISO day (midnight) — internal; callers stay on strings. */
function asUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/** ISO "YYYY-MM-DD" for a UTC Date. */
function isoOf(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

/** Add (or subtract) whole days to an ISO date. */
export function addDays(iso: string, n: number): string {
  const dt = asUTC(iso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return isoOf(dt)
}

/** Add (or subtract) whole months, clamping the day to the target month. */
export function addMonths(iso: string, n: number): string {
  const dt = asUTC(iso)
  const day = dt.getUTCDate()
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + n)
  const lastDay = new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)
  ).getUTCDate()
  dt.setUTCDate(Math.min(day, lastDay))
  return isoOf(dt)
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return asUTC(iso).getUTCDay()
}

/** Day-of-month (1–31). */
export function dayOfMonth(iso: string): number {
  return asUTC(iso).getUTCDate()
}

/** Month index (0–11). */
export function monthOf(iso: string): number {
  return asUTC(iso).getUTCMonth()
}

/** Full year. */
export function yearOf(iso: string): number {
  return asUTC(iso).getUTCFullYear()
}

/** Monday-based weekday index, 0 = Monday … 6 = Sunday. */
export function mondayIndex(iso: string): number {
  return (weekday(iso) + 6) % 7
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -mondayIndex(iso))
}

/** The seven ISO days (Mon → Sun) of the week containing `iso`. */
export function weekDays(iso: string): string[] {
  const start = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** First day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  const [y, m] = iso.split("-")
  return `${y}-${m}-01`
}

/**
 * A 6×7 month grid (Mon-first) covering the month of `iso`, including the
 * leading/trailing days from adjacent months so every row is full.
 */
export function monthMatrix(iso: string): string[][] {
  const gridStart = startOfWeek(startOfMonth(iso))
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => addDays(gridStart, r * 7 + c))
  )
}

export const sameDay = (a: string, b: string) => a === b
export const sameMonth = (a: string, b: string) =>
  a.slice(0, 7) === b.slice(0, 7)
export const isToday = (iso: string) => iso === TODAY_ISO
export const isWeekend = (iso: string) => mondayIndex(iso) >= 5
export const isPastDay = (iso: string) => iso < TODAY_ISO

// ── Relative day words ↔ real dates ──────────────────────────────────────────

/** The first ISO date strictly after `from` whose weekday is `dow` (0–6). */
function nextDow(from: string, dow: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i)
    if (weekday(d) === dow) return d
  }
  return from
}

/** The app's bookable day keys, resolved to real dates off {@link TODAY_ISO}. */
export const DAYKEY_DATE: Record<string, string> = {
  today: TODAY_ISO,
  tomorrow: addDays(TODAY_ISO, 1),
  sat: nextDow(TODAY_ISO, 6),
  sun: nextDow(TODAY_ISO, 0),
  mon: nextDow(TODAY_ISO, 1),
}

/** ISO date for a bookable day key, or null for non-bookable keys ("past"). */
export function dateForDayKey(key?: string): string | null {
  return (key && DAYKEY_DATE[key]) ?? null
}

/** The bookable day key that lands on `iso`, if any (reverse of the map). */
export function dayKeyForDate(iso: string): string | null {
  for (const [key, date] of Object.entries(DAYKEY_DATE))
    if (date === iso) return key
  return null
}

/**
 * Seed for the venue's deterministic schedule generators on a given date. The
 * generators key their hash + "is today" check off a day word; passing the
 * bookable key when one exists (so today keeps its past-shading) and the raw
 * ISO date otherwise lets them produce a stable schedule for ANY day.
 */
export function seedForDate(iso: string): string {
  return dayKeyForDate(iso) ?? iso
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * Parse a stored label like "Sat, 21 Jun" or "Mon, 16 Jun" to an ISO date in
 * {@link TODAY_ISO}'s year. Used to place legacy/past bookings on the month grid.
 */
export function parseLabelDate(label: string): string | null {
  const m = label.match(/(\d{1,2})\s+([A-Za-z]{3})/)
  if (!m) return null
  const day = Number(m[1])
  const month = MONTH_ABBR.findIndex(
    (a) => a.toLowerCase() === m[2].toLowerCase()
  )
  if (month < 0) return null
  const y = TODAY_ISO.slice(0, 4)
  return `${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`
}
