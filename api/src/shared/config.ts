// App configuration & presentation constants — catalogs, theme accent maps and
// fixed time grids. These are not "data" (nothing a database would own); they
// are UI config the helpers and views read synchronously, so they live in the
// shared package rather than being served by the API.

import type {
  CourtState,
  CustomerTier,
  InsightSeverity,
  Level,
  Localized,
  ReservationStatus,
  RoomLevel,
  SlotKind,
  Sport,
  TrustTier,
} from "./types.js"

// ── Sports catalog ───────────────────────────────────────────────────────────

export const SPORTS: Sport[] = [
  { key: "badminton", label: "Badminton", short: "BD", accent: "bg-chart-3" },
]

// ── Skill levels ─────────────────────────────────────────────────────────────

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
export const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"]

/** Text-color class for each trust tier (kept on the emerald/lime theme). */
export const trustTierAccent: Record<TrustTier, string> = {
  trusted: "text-brand",
  reliable: "text-chart-3",
  new: "text-muted-foreground",
}

// ── Court booking grid ───────────────────────────────────────────────────────

/** Fixed hourly start times offered when booking a court. One-hour slots. */
export const SLOT_TIMES = ["17:00", "18:00", "19:00", "20:00", "21:00"]

/**
 * Open window the player court-booking calendar renders (HH:MM, end exclusive).
 * Free gaps the player can tap are confined to this window.
 */
export const COURT_OPEN_FROM = "06:00"
export const COURT_OPEN_TO = "23:00"

/**
 * The bookable day-strip window is now a real sliding 7-day range anchored on
 * the server's "now" — see `bookingDays`/`venueDays` in `helpers.ts` (they need
 * the runtime anchor, so they live with the other datetime helpers rather than
 * as a static constant here).
 */

/** Preset start times offered when hosting a room. */
export const ROOM_TIME_SLOTS = [
  "Today 18:30 – 19:30",
  "Today 19:30 – 20:30",
  "Today 20:30 – 21:30",
  "Tomorrow 07:00 – 08:00",
  "Tomorrow 19:00 – 20:00",
  "Sat 09:30 – 10:30",
]

// ── Venue: theme accent maps ─────────────────────────────────────────────────

/** Theme tint per live court state (kept on the emerald/lime palette). */
export const courtStateAccent: Record<CourtState, string> = {
  "in-play": "bg-brand/12 text-brand",
  upcoming: "bg-lime/15 text-brand",
  available: "bg-muted text-muted-foreground",
  maintenance: "bg-destructive/12 text-destructive",
}

/** Tint classes per schedule slot kind. */
export const slotKindAccent: Record<SlotKind, string> = {
  booked: "bg-brand/15 text-brand ring-brand/20",
  "walk-in": "bg-lime/20 text-brand ring-lime/30",
  // An unpaid hold: muted amber so the operator reads it as "occupied, awaiting
  // payment" — visibly held, but not the solid `booked` tint of a paid slot.
  held: "bg-chart-3/12 text-chart-3 ring-chart-3/25",
  blocked:
    "bg-destructive/10 text-destructive/80 ring-destructive/15 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,color-mix(in_oklch,var(--destructive)_12%,transparent)_5px,color-mix(in_oklch,var(--destructive)_12%,transparent)_10px)]",
  free: "bg-muted/40 text-muted-foreground/50 ring-transparent hover:bg-muted",
}

/** Tint classes per reservation status. */
export const reservationStatusAccent: Record<ReservationStatus, string> = {
  pending: "bg-chart-3/15 text-chart-3",
  confirmed: "bg-brand/12 text-brand",
  "checked-in": "bg-lime/20 text-brand",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  "no-show": "bg-destructive/12 text-destructive",
  // An unpaid, non-actionable hold — muted so it reads as "held, not yet a
  // booking the operator can approve/decline".
  held: "bg-chart-3/12 text-chart-3",
}

export const riskTierAccent: Record<"low" | "medium" | "high", string> = {
  low: "text-brand",
  medium: "text-chart-3",
  high: "text-destructive",
}

export const customerTierAccent: Record<CustomerTier, string> = {
  vip: "bg-lime/20 text-brand",
  regular: "bg-brand/12 text-brand",
  new: "bg-chart-3/15 text-chart-3",
  "at-risk": "bg-destructive/12 text-destructive",
}

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

// ── Venue: schedule & analytics axes ─────────────────────────────────────────

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
