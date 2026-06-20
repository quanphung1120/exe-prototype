// Mock data for the SportMatch AI **venue** workspace (the operator surface).
// Like the player data, every value is static/deterministic so server and
// client renders stay in sync — no Date.now()/random in render.
//
// One departure from the player data: AI-generated *content* (the monitor's
// insights) carries its own { en, vi } strings here instead of living in the
// i18n message files. It reads more like data than UI chrome, and keeps the
// provider, the floating dock and the Monitor view reading one source of truth.

import { formatVnd, type SportKey } from "@/components/dashboard/data"

export { formatVnd }
export type { SportKey }

// ── Localized content helpers ────────────────────────────────────────────────

export interface Localized {
  en: string
  vi: string
}
export interface LocalizedList {
  en: string[]
  vi: string[]
}

/** Pick the active-locale string from a {@link Localized} pair. */
export const locStr = (l: Localized, locale: string) =>
  locale === "vi" ? l.vi : l.en
/** Pick the active-locale array from a {@link LocalizedList} pair. */
export const locList = (l: LocalizedList, locale: string) =>
  locale === "vi" ? l.vi : l.en

// ── The venue ────────────────────────────────────────────────────────────────

export const VENUE = {
  name: "Shuttle Republic",
  initials: "SR",
  district: "Cầu Giấy",
  city: "Hà Nội",
  /** Sports played at this center. */
  sports: ["badminton", "pickleball"] as SportKey[],
  openFrom: "06:00",
  openTo: "22:00",
  rating: 4.8,
  reviews: 1240,
  manager: { name: "Lê Quang", initials: "LQ" },
  /** A fixed "current time" so the live views read coherently (no real clock). */
  now: "18:00",
} as const

// ── Physical courts ──────────────────────────────────────────────────────────

export type CourtState = "available" | "in-play" | "upcoming" | "maintenance"

export interface VenueCourt {
  id: string
  name: string
  sport: SportKey
  surface: string
  state: CourtState
  /** When the current/next block ends or starts (HH:MM), for the live strip. */
  until?: string
  /** Who is on / coming up, for the live strip. */
  occupant?: string
  /** Maintenance reason when state === "maintenance". */
  note?: string
  /** Share of today's open hours this court is booked, 0–100. */
  utilToday: number
  pricePerHour: number
}

export const VENUE_COURTS: VenueCourt[] = [
  {
    id: "vc1",
    name: "Court 1",
    sport: "badminton",
    surface: "Sprung timber",
    state: "in-play",
    until: "19:30",
    occupant: "Badminton Crew",
    utilToday: 86,
    pricePerHour: 360000,
  },
  {
    id: "vc2",
    name: "Court 2",
    sport: "badminton",
    surface: "Sprung timber",
    state: "available",
    utilToday: 64,
    pricePerHour: 360000,
  },
  {
    id: "vc3",
    name: "Court 3",
    sport: "badminton",
    surface: "Sprung timber",
    state: "upcoming",
    until: "19:00",
    occupant: "Trần Huy +3",
    utilToday: 78,
    pricePerHour: 360000,
  },
  {
    id: "vc4",
    name: "Court 4",
    sport: "badminton",
    surface: "Sprung timber",
    state: "maintenance",
    note: "Floor re-coating",
    utilToday: 0,
    pricePerHour: 360000,
  },
  {
    id: "vc5",
    name: "Court 5",
    sport: "pickleball",
    surface: "Cushioned acrylic",
    state: "in-play",
    until: "18:45",
    occupant: "Lê Lan +2",
    utilToday: 71,
    pricePerHour: 240000,
  },
  {
    id: "vc6",
    name: "Court 6",
    sport: "pickleball",
    surface: "Cushioned acrylic",
    state: "available",
    utilToday: 52,
    pricePerHour: 240000,
  },
]

export const courtById = (id: string) => VENUE_COURTS.find((c) => c.id === id)

/** Theme tint per live court state (kept on the emerald/lime palette). */
export const courtStateAccent: Record<CourtState, string> = {
  "in-play": "bg-brand/12 text-brand",
  upcoming: "bg-lime/15 text-brand",
  available: "bg-muted text-muted-foreground",
  maintenance: "bg-destructive/12 text-destructive",
}

// ── Headline KPIs (today) ────────────────────────────────────────────────────

export const VENUE_STATS = {
  /** Share of court-hours sold today, 0–100. */
  occupancy: 78,
  occupancyDelta: 6,
  /** Revenue booked today, VND. */
  revenueToday: 8640000,
  revenueDelta: 12,
  bookingsToday: 34,
  bookingsDelta: 4,
  /** No-show rate over the trailing 30 days, %. */
  noShowRate: 7,
  noShowDelta: -2,
  newCustomers: 5,
  newCustomersDelta: 2,
  /** Trailing-7-day average utilization, %. */
  utilization: 71,
} as const

export type VenueStats = typeof VENUE_STATS

// ── Schedule grid (courts × hours) ───────────────────────────────────────────

/** Hourly columns the schedule renders (the venue's open hours). */
export const SCHEDULE_HOURS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
]

/** The day strip for the schedule/reservations (static so SSR stays in sync). */
export const VENUE_DAYS: { key: string; label: Localized }[] = [
  { key: "today", label: { en: "Today", vi: "Hôm nay" } },
  { key: "tomorrow", label: { en: "Tomorrow", vi: "Ngày mai" } },
  { key: "sat", label: { en: "Sat", vi: "Th 7" } },
  { key: "sun", label: { en: "Sun", vi: "CN" } },
  { key: "mon", label: { en: "Mon", vi: "Th 2" } },
]

export type SlotKind = "free" | "booked" | "blocked" | "walk-in"

export interface ScheduleSlot {
  courtId: string
  hour: string
  kind: SlotKind
  customer?: string
  sport: SportKey
  party?: number
  /** True for hours before {@link VENUE.now} on the "today" column. */
  past?: boolean
}

/** Tiny FNV-1a hash — deterministic schedule without Date/random. */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

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

const hourIndex = (hour: string) => SCHEDULE_HOURS.indexOf(hour)

/**
 * A calendar event — a real start + arbitrary duration (so the schedule can be
 * drawn Google-Calendar-style with variable-height blocks). Free time is simply
 * the gaps between events, so a ScheduleEvent is never "free".
 */
export interface ScheduleEvent {
  id: string
  courtId: string
  /** "HH:MM" start (may be off the hour, e.g. 18:30). */
  start: string
  durationMin: number
  kind: Exclude<SlotKind, "free">
  customer?: string
  sport: SportKey
  party?: number
  /** True once the event has fully passed (today only). */
  past?: boolean
}

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
const overlaps = (aS: number, aD: number, bS: number, bD: number) =>
  aS < bS + bD && bS < aS + aD

/**
 * Deterministic calendar events for a court on a day: variable-length blocks
 * with gaps and off-the-hour starts, denser toward the evening peak. Court 4
 * is a single all-day maintenance block. Same court + day → same schedule (no
 * Date/random), so server and client renders agree.
 */
export function courtDayEvents(
  courtId: string,
  dayKey: string
): ScheduleEvent[] {
  const court = courtById(courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const open = minutesOf(VENUE.openFrom)
  const close = minutesOf(VENUE.openTo)
  const now = minutesOf(VENUE.now)
  const isToday = dayKey === "today"

  if (court?.state === "maintenance") {
    return [
      {
        id: `${courtId}-maint`,
        courtId,
        start: VENUE.openFrom,
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

/** Calendar events for every court, in {@link VENUE_COURTS} order. */
export function venueEventsFor(dayKey: string): ScheduleEvent[][] {
  return VENUE_COURTS.map((c) => courtDayEvents(c.id, dayKey))
}

/**
 * Hour-tile view of a court's day, DERIVED from {@link courtDayEvents} so the
 * legacy grid, the copilot's free-slot search and the calendar all agree: an
 * hour reads booked/walk-in/blocked when an event overlaps it, else free.
 */
export function courtDaySlots(courtId: string, dayKey: string): ScheduleSlot[] {
  const court = courtById(courtId)
  const sport: SportKey = court?.sport ?? "badminton"
  const events = courtDayEvents(courtId, dayKey)
  const nowIdx = hourIndex(VENUE.now)
  return SCHEDULE_HOURS.map((hour, i) => {
    const past = dayKey === "today" && i < nowIdx
    const ev = events.find((e) =>
      overlaps(minutesOf(hour), 60, minutesOf(e.start), e.durationMin)
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

/** The full hour grid: one row of slots per court, in VENUE_COURTS order. */
export function venueScheduleFor(dayKey: string): ScheduleSlot[][] {
  return VENUE_COURTS.map((c) => courtDaySlots(c.id, dayKey))
}

/** Tint classes per schedule slot kind. */
export const slotKindAccent: Record<SlotKind, string> = {
  booked: "bg-brand/15 text-brand ring-brand/20",
  "walk-in": "bg-lime/20 text-brand ring-lime/30",
  blocked:
    "bg-destructive/10 text-destructive/80 ring-destructive/15 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,color-mix(in_oklch,var(--destructive)_12%,transparent)_5px,color-mix(in_oklch,var(--destructive)_12%,transparent)_10px)]",
  free: "bg-muted/40 text-muted-foreground/50 ring-transparent hover:bg-muted",
}

// ── Reservations ─────────────────────────────────────────────────────────────

export type BookingSource = "app" | "walk-in"
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "completed"
  | "cancelled"
  | "no-show"

export interface Reservation {
  id: string
  customer: { name: string; initials: string }
  sport: SportKey
  court: string
  day: Localized
  time: string
  party: number
  source: BookingSource
  status: ReservationStatus
  price: number
  /** AI-estimated no-show probability, 0–100. */
  noShowRisk: number
  isRegular: boolean
}

export const RESERVATIONS: Reservation[] = [
  {
    id: "rv1",
    customer: { name: "Nguyễn Bảo", initials: "NB" },
    sport: "badminton",
    court: "Court 2",
    day: { en: "Today", vi: "Hôm nay" },
    time: "19:00 – 20:00",
    party: 4,
    source: "app",
    status: "pending",
    price: 360000,
    noShowRisk: 14,
    isRegular: false,
  },
  {
    id: "rv2",
    customer: { name: "Trịnh Long", initials: "TL" },
    sport: "pickleball",
    court: "Court 6",
    day: { en: "Today", vi: "Hôm nay" },
    time: "20:00 – 21:00",
    party: 4,
    source: "app",
    status: "pending",
    price: 240000,
    noShowRisk: 62,
    isRegular: false,
  },
  {
    id: "rv3",
    customer: { name: "Trần Huy", initials: "TH" },
    sport: "badminton",
    court: "Court 3",
    day: { en: "Today", vi: "Hôm nay" },
    time: "19:00 – 20:30",
    party: 4,
    source: "app",
    status: "confirmed",
    price: 540000,
    noShowRisk: 8,
    isRegular: true,
  },
  {
    id: "rv4",
    customer: { name: "Lê Lan", initials: "LL" },
    sport: "pickleball",
    court: "Court 5",
    day: { en: "Today", vi: "Hôm nay" },
    time: "17:45 – 18:45",
    party: 3,
    source: "app",
    status: "checked-in",
    price: 240000,
    noShowRisk: 5,
    isRegular: true,
  },
  {
    id: "rv5",
    customer: { name: "Phạm Quân", initials: "PQ" },
    sport: "badminton",
    court: "Court 1",
    day: { en: "Today", vi: "Hôm nay" },
    time: "18:00 – 19:30",
    party: 2,
    source: "app",
    status: "checked-in",
    price: 540000,
    noShowRisk: 11,
    isRegular: true,
  },
  {
    id: "rv6",
    customer: { name: "Đỗ Anh", initials: "ĐA" },
    sport: "pickleball",
    court: "Court 6",
    day: { en: "Tomorrow", vi: "Ngày mai" },
    time: "07:00 – 08:00",
    party: 4,
    source: "walk-in",
    status: "confirmed",
    price: 240000,
    noShowRisk: 9,
    isRegular: false,
  },
  {
    id: "rv7",
    customer: { name: "Vũ Hà", initials: "VH" },
    sport: "badminton",
    court: "Court 2",
    day: { en: "Tomorrow", vi: "Ngày mai" },
    time: "19:00 – 20:00",
    party: 4,
    source: "app",
    status: "confirmed",
    price: 360000,
    noShowRisk: 21,
    isRegular: true,
  },
  {
    id: "rv8",
    customer: { name: "Bùi Khang", initials: "BK" },
    sport: "badminton",
    court: "Court 1",
    day: { en: "Mon, 16 Jun", vi: "Th 2, 16/6" },
    time: "20:00 – 21:00",
    party: 2,
    source: "app",
    status: "completed",
    price: 360000,
    noShowRisk: 0,
    isRegular: true,
  },
  {
    id: "rv9",
    customer: { name: "Ngô Sơn", initials: "NS" },
    sport: "pickleball",
    court: "Court 5",
    day: { en: "Sun, 15 Jun", vi: "CN, 15/6" },
    time: "18:00 – 19:00",
    party: 4,
    source: "app",
    status: "no-show",
    price: 240000,
    noShowRisk: 71,
    isRegular: false,
  },
  {
    id: "rv10",
    customer: { name: "Đặng Thu", initials: "ĐT" },
    sport: "badminton",
    court: "Court 3",
    day: { en: "Sun, 15 Jun", vi: "CN, 15/6" },
    time: "09:00 – 10:00",
    party: 2,
    source: "app",
    status: "completed",
    price: 360000,
    noShowRisk: 0,
    isRegular: true,
  },
]

/** Tint classes per reservation status. */
export const reservationStatusAccent: Record<ReservationStatus, string> = {
  pending: "bg-chart-3/15 text-chart-3",
  confirmed: "bg-brand/12 text-brand",
  "checked-in": "bg-lime/20 text-brand",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  "no-show": "bg-destructive/12 text-destructive",
}

export type RiskTier = "low" | "medium" | "high"

/** Bucket an AI no-show probability into a risk tier. */
export function riskTier(risk: number): RiskTier {
  if (risk >= 50) return "high"
  if (risk >= 20) return "medium"
  return "low"
}

export const riskTierAccent: Record<RiskTier, string> = {
  low: "text-brand",
  medium: "text-chart-3",
  high: "text-destructive",
}

// ── Customers (CRM) ──────────────────────────────────────────────────────────

export type CustomerTier = "vip" | "regular" | "new" | "at-risk"

export interface VenueCustomer {
  id: string
  name: string
  initials: string
  favoriteSport: SportKey
  /** Lifetime bookings at this venue. */
  visits: number
  lastVisit: Localized
  /** Lifetime value, VND. */
  ltv: number
  noShowRate: number
  tier: CustomerTier
  /** Visit trend vs prior period, %. */
  trend: number
}

export const VENUE_CUSTOMERS: VenueCustomer[] = [
  {
    id: "cu1",
    name: "Trần Huy",
    initials: "TH",
    favoriteSport: "badminton",
    visits: 64,
    lastVisit: { en: "2 days ago", vi: "2 ngày trước" },
    ltv: 21800000,
    noShowRate: 2,
    tier: "vip",
    trend: 12,
  },
  {
    id: "cu2",
    name: "Lê Lan",
    initials: "LL",
    favoriteSport: "pickleball",
    visits: 48,
    lastVisit: { en: "Today", vi: "Hôm nay" },
    ltv: 14200000,
    noShowRate: 4,
    tier: "vip",
    trend: 8,
  },
  {
    id: "cu3",
    name: "Phạm Quân",
    initials: "PQ",
    favoriteSport: "badminton",
    visits: 31,
    lastVisit: { en: "Today", vi: "Hôm nay" },
    ltv: 9600000,
    noShowRate: 6,
    tier: "regular",
    trend: 5,
  },
  {
    id: "cu4",
    name: "Vũ Hà",
    initials: "VH",
    favoriteSport: "badminton",
    visits: 27,
    lastVisit: { en: "3 weeks ago", vi: "3 tuần trước" },
    ltv: 8100000,
    noShowRate: 18,
    tier: "at-risk",
    trend: -34,
  },
  {
    id: "cu5",
    name: "Bùi Khang",
    initials: "BK",
    favoriteSport: "badminton",
    visits: 22,
    lastVisit: { en: "5 days ago", vi: "5 ngày trước" },
    ltv: 6900000,
    noShowRate: 9,
    tier: "regular",
    trend: 3,
  },
  {
    id: "cu6",
    name: "Đỗ Anh",
    initials: "ĐA",
    favoriteSport: "pickleball",
    visits: 14,
    lastVisit: { en: "1 week ago", vi: "1 tuần trước" },
    ltv: 3300000,
    noShowRate: 7,
    tier: "regular",
    trend: 19,
  },
  {
    id: "cu7",
    name: "Ngô Sơn",
    initials: "NS",
    favoriteSport: "pickleball",
    visits: 5,
    lastVisit: { en: "Yesterday", vi: "Hôm qua" },
    ltv: 1100000,
    noShowRate: 22,
    tier: "new",
    trend: 0,
  },
  {
    id: "cu8",
    name: "Đặng Thu",
    initials: "ĐT",
    favoriteSport: "badminton",
    visits: 3,
    lastVisit: { en: "4 days ago", vi: "4 ngày trước" },
    ltv: 980000,
    noShowRate: 0,
    tier: "new",
    trend: 0,
  },
]

export const customerTierAccent: Record<CustomerTier, string> = {
  vip: "bg-lime/20 text-brand",
  regular: "bg-brand/12 text-brand",
  new: "bg-chart-3/15 text-chart-3",
  "at-risk": "bg-destructive/12 text-destructive",
}

// ── Analytics series ─────────────────────────────────────────────────────────

/** Last 7 days of revenue (oldest → today), VND. */
export const REVENUE_SERIES: { label: Localized; value: number }[] = [
  { label: { en: "Mon", vi: "T2" }, value: 6200000 },
  { label: { en: "Tue", vi: "T3" }, value: 5800000 },
  { label: { en: "Wed", vi: "T4" }, value: 6900000 },
  { label: { en: "Thu", vi: "T5" }, value: 7400000 },
  { label: { en: "Fri", vi: "T6" }, value: 9100000 },
  { label: { en: "Sat", vi: "T7" }, value: 11200000 },
  { label: { en: "Sun", vi: "CN" }, value: 8640000 },
]

/** Hours shown in the utilization heatmap (condensed to the active window). */
export const HEATMAP_HOURS = ["08", "10", "12", "14", "16", "18", "20"]

export const HEATMAP_DAYS: Localized[] = [
  { en: "Mon", vi: "T2" },
  { en: "Tue", vi: "T3" },
  { en: "Wed", vi: "T4" },
  { en: "Thu", vi: "T5" },
  { en: "Fri", vi: "T6" },
  { en: "Sat", vi: "T7" },
  { en: "Sun", vi: "CN" },
]

/** 7 days × {@link HEATMAP_HOURS} utilization intensities, 0–100. */
export const UTILIZATION_HEATMAP: number[][] = HEATMAP_DAYS.map((_, d) =>
  HEATMAP_HOURS.map((h, i) => {
    const peak = i >= 4 // 16:00+
    const weekend = d >= 5
    const base = peak ? 70 : 30
    const v = base + (weekend ? 18 : 0) + (hashStr(`${d}:${h}`) % 26)
    return Math.min(100, v)
  })
)

export const SPORT_MIX: { sport: SportKey; bookings: number; pct: number }[] = [
  { sport: "badminton", bookings: 412, pct: 68 },
  { sport: "pickleball", bookings: 194, pct: 32 },
]

export const CHANNEL_MIX: { source: BookingSource; pct: number }[] = [
  { source: "app", pct: 82 },
  { source: "walk-in", pct: 18 },
]

/** Busiest hours of the week, for the peak-demand callout. */
export const PEAK_HOURS: { hour: string; util: number }[] = [
  { hour: "19:00", util: 96 },
  { hour: "20:00", util: 91 },
  { hour: "18:00", util: 88 },
  { hour: "21:00", util: 74 },
]

// ── AI Monitor: insights ─────────────────────────────────────────────────────

export type InsightKind =
  | "demand-surge"
  | "underutilized"
  | "no-show-risk"
  | "maintenance"
  | "revenue"
  | "retention"
  | "weather"

export type InsightSeverity = "info" | "warn" | "critical"

export interface VenueInsight {
  id: string
  kind: InsightKind
  severity: InsightSeverity
  title: Localized
  detail: Localized
  /** Faked AI "chain of thought" leading to the recommendation. */
  reasoning: LocalizedList
  /** Call-to-action label on the Apply button. */
  action: Localized
  /** Human impact line, e.g. "+1.2M / week". */
  impact: Localized
  /** What the insight is about (court/slot/customer), shown as a chip. */
  target?: Localized
  /** Signed nudge applied to a KPI when the action is taken. */
  effect?: {
    metric: "revenueToday" | "occupancy" | "noShowRate"
    delta: number
  }
}

export const VENUE_INSIGHTS: VenueInsight[] = [
  {
    id: "in1",
    kind: "underutilized",
    severity: "warn",
    title: {
      en: "Court 5 & 6 sit idle 14:00–16:00",
      vi: "Sân 5 & 6 trống khung 14:00–16:00",
    },
    detail: {
      en: "Weekday afternoons on the pickleball courts run at 22% utilization — well below the 71% house average.",
      vi: "Chiều các ngày trong tuần ở sân pickleball chỉ đạt 22% công suất — thấp hơn nhiều so với mức trung bình 71%.",
    },
    reasoning: {
      en: [
        "Compared the last 30 afternoons against the venue average",
        "Found pickleball 14:00–16:00 booked 22% of the time",
        "Demand model: a 15% off-peak price would lift fill to ~58%",
        "Net revenue still rises despite the lower rate",
      ],
      vi: [
        "So sánh 30 buổi chiều gần nhất với mức trung bình của sân",
        "Phát hiện pickleball 14:00–16:00 chỉ kín 22% thời lượng",
        "Mô hình cầu: giảm 15% giờ thấp điểm nâng tỷ lệ lấp đầy ~58%",
        "Doanh thu thuần vẫn tăng dù đơn giá thấp hơn",
      ],
    },
    action: {
      en: "Apply 15% off-peak rate",
      vi: "Áp giá giờ thấp điểm -15%",
    },
    impact: { en: "+1.2M / week", vi: "+1,2Tr / tuần" },
    target: { en: "Court 5–6 · 14:00–16:00", vi: "Sân 5–6 · 14:00–16:00" },
    effect: { metric: "revenueToday", delta: 280000 },
  },
  {
    id: "in2",
    kind: "revenue",
    severity: "warn",
    title: {
      en: "Regulars pre-pay single hours — sell them a pack",
      vi: "Khách quen trả trước từng giờ lẻ — hãy bán gói",
    },
    detail: {
      en: "Your top regulars pre-pay 4+ separate hours a month. A pre-paid 10-hour pack locks that revenue in up front and keeps them booking here.",
      vi: "Nhóm khách quen hàng đầu trả trước hơn 4 giờ lẻ mỗi tháng. Gói 10 giờ trả trước giúp chốt doanh thu ngay từ đầu và giữ chân họ.",
    },
    reasoning: {
      en: [
        "Top 12 regulars average 4.6 pre-paid hours each month",
        "They book one hour at a time — no commitment beyond the slot",
        "A 10-hour pack at 10% off still nets more than single bookings",
        "Auto-offering the pack at checkout converts ~1 in 4 regulars",
      ],
      vi: [
        "12 khách quen hàng đầu trung bình 4,6 giờ trả trước mỗi tháng",
        "Họ đặt từng giờ một — không cam kết ngoài lượt đó",
        "Gói 10 giờ giảm 10% vẫn thu về nhiều hơn đặt lẻ",
        "Tự động mời mua gói khi thanh toán chuyển đổi ~1/4 khách quen",
      ],
    },
    action: {
      en: "Launch 10-hour pre-paid pack",
      vi: "Mở gói 10 giờ trả trước",
    },
    impact: { en: "+2.3M / month", vi: "+2,3Tr / tháng" },
    target: { en: "Regulars · pre-paid packs", vi: "Khách quen · gói trả trước" },
    effect: { metric: "revenueToday", delta: 300000 },
  },
  {
    id: "in3",
    kind: "demand-surge",
    severity: "info",
    title: {
      en: "Saturday evening is selling out fast",
      vi: "Tối thứ Bảy đang kín chỗ rất nhanh",
    },
    detail: {
      en: "19:00–21:00 Saturday is 96% booked five days out. Prime slots are clearing 2 days earlier than usual.",
      vi: "Khung 19:00–21:00 thứ Bảy đã kín 96% dù còn 5 ngày. Giờ vàng hết sớm hơn thường lệ 2 ngày.",
    },
    reasoning: {
      en: [
        "Saturday 19:00–21:00 fill is 96% with 5 days lead",
        "Booking pace is 2 days ahead of the trailing month",
        "Willingness-to-pay supports a +10% prime-time rate",
        "Opening a waitlist captures the overflow demand",
      ],
      vi: [
        "Tỷ lệ lấp đầy thứ Bảy 19:00–21:00 đạt 96% khi còn 5 ngày",
        "Tốc độ đặt nhanh hơn 2 ngày so với tháng trước",
        "Mức sẵn lòng chi trả cho phép tăng giá giờ vàng +10%",
        "Mở danh sách chờ để giữ lượng cầu vượt mức",
      ],
    },
    action: {
      en: "Raise Sat prime rate +10%",
      vi: "Tăng giá giờ vàng T7 +10%",
    },
    impact: { en: "+1.8M / week", vi: "+1,8Tr / tuần" },
    target: { en: "Sat · 19:00–21:00", vi: "T7 · 19:00–21:00" },
    effect: { metric: "revenueToday", delta: 360000 },
  },
  {
    id: "in4",
    kind: "maintenance",
    severity: "warn",
    title: {
      en: "Court 1 flooring nearing service interval",
      vi: "Mặt sân 1 sắp đến hạn bảo trì",
    },
    detail: {
      en: "Court 1 has logged 1,180 play-hours since the last re-coat — usage models flag grip loss within ~2 weeks.",
      vi: "Sân 1 đã chạy 1.180 giờ chơi kể từ lần phủ gần nhất — mô hình dự báo giảm độ bám trong khoảng 2 tuần.",
    },
    reasoning: {
      en: [
        "Court 1 is the most-played court at 86% today",
        "1,180 play-hours since the last surface treatment",
        "Wear curve predicts grip complaints in ~14 days",
        "Booking a low-demand Tuesday avoids lost revenue",
      ],
      vi: [
        "Sân 1 được chơi nhiều nhất, hôm nay 86%",
        "1.180 giờ chơi kể từ lần xử lý mặt sân gần nhất",
        "Đường cong hao mòn dự báo than phiền độ bám trong ~14 ngày",
        "Đặt lịch vào thứ Ba ít khách để tránh mất doanh thu",
      ],
    },
    action: {
      en: "Schedule Tue maintenance",
      vi: "Lên lịch bảo trì thứ Ba",
    },
    impact: { en: "Avoid downtime", vi: "Tránh gián đoạn" },
    target: { en: "Court 1", vi: "Sân 1" },
  },
  {
    id: "in5",
    kind: "retention",
    severity: "warn",
    title: {
      en: "Vũ Hà hasn't booked in 3 weeks",
      vi: "Vũ Hà chưa đặt sân 3 tuần",
    },
    detail: {
      en: "A regular (27 visits) has gone quiet — visit cadence dropped 34%. Churn model puts win-back odds highest this week.",
      vi: "Một khách quen (27 lượt) đã im ắng — tần suất giảm 34%. Mô hình rời bỏ cho thấy tuần này khả năng kéo lại cao nhất.",
    },
    reasoning: {
      en: [
        "27-visit regular, normally weekly",
        "Last visit was 3 weeks ago — 34% below cadence",
        "Churn model: win-back odds peak in the next 7 days",
        "A free off-peak hour historically re-activates 1 in 3",
      ],
      vi: [
        "Khách quen 27 lượt, thường tuần nào cũng chơi",
        "Lần cuối cách đây 3 tuần — thấp hơn nhịp 34%",
        "Mô hình rời bỏ: khả năng kéo lại đỉnh trong 7 ngày tới",
        "Tặng 1 giờ thấp điểm thường kích hoạt lại 1/3 khách",
      ],
    },
    action: {
      en: "Send win-back offer",
      vi: "Gửi ưu đãi kéo lại",
    },
    impact: { en: "Save 8.1M LTV", vi: "Giữ 8,1Tr giá trị" },
    target: { en: "Vũ Hà · at-risk", vi: "Vũ Hà · nguy cơ rời" },
  },
  {
    id: "in6",
    kind: "weather",
    severity: "info",
    title: {
      en: "Rain forecast Thursday — promote indoor courts",
      vi: "Dự báo mưa thứ Năm — đẩy sân trong nhà",
    },
    detail: {
      en: "85% chance of rain Thu evening. Indoor demand historically jumps 28% — a timely push fills the badminton hall.",
      vi: "85% khả năng mưa tối thứ Năm. Cầu sân trong nhà thường tăng 28% — đẩy thông báo đúng lúc sẽ lấp đầy nhà thi đấu cầu lông.",
    },
    reasoning: {
      en: [
        "Forecast: 85% rain Thursday 17:00–22:00",
        "On past rainy evenings indoor bookings rose 28%",
        "Thu evening still has 9 open badminton slots",
        "A push notification converts ~15% of nearby players",
      ],
      vi: [
        "Dự báo: 85% mưa thứ Năm 17:00–22:00",
        "Những tối mưa trước, đặt sân trong nhà tăng 28%",
        "Tối thứ Năm còn 9 lượt cầu lông trống",
        "Thông báo đẩy chuyển đổi ~15% người chơi lân cận",
      ],
    },
    action: {
      en: "Push indoor promo",
      vi: "Đẩy ưu đãi sân trong nhà",
    },
    impact: { en: "+900K Thu", vi: "+900K thứ Năm" },
    target: { en: "Badminton hall · Thu", vi: "Nhà cầu lông · T5" },
    effect: { metric: "occupancy", delta: 2 },
  },
]

/** Theme tint + ring per insight severity. */
export const severityAccent: Record<
  InsightSeverity,
  { chip: string; ring: string; dot: string }
> = {
  info: {
    chip: "bg-brand/12 text-brand",
    ring: "ring-brand/15",
    dot: "bg-brand",
  },
  warn: {
    chip: "bg-chart-3/15 text-chart-3",
    ring: "ring-chart-3/20",
    dot: "bg-chart-3",
  },
  critical: {
    chip: "bg-destructive/12 text-destructive",
    ring: "ring-destructive/25",
    dot: "bg-destructive",
  },
}
