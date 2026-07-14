// Calendar date helpers — pure, SSR-deterministic date math for the Bookings
// calendar's Day / Week / Month views.
//
// `dayKey` is a real ISO date ("YYYY-MM-DD") everywhere, so this module is
// plain UTC date arithmetic with no anchor of its own — callers pass in
// `todayIso` (from `useData()`, ultimately `Seed.serverNow`) wherever "today"
// matters, so the server and client always compute the same grid (no
// `Date.now` or local-timezone drift in render).

export type CalendarView = "day" | "week" | "month"

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
export const isToday = (iso: string, todayIso: string) => iso === todayIso
export const isWeekend = (iso: string) => mondayIndex(iso) >= 5
export const isPastDay = (iso: string, todayIso: string) => iso < todayIso
