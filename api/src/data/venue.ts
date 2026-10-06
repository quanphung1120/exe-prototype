// Venue-workspace templates. No venue, court, booking or customer is seeded
// any more — every venue is created by a real operator (VenuesService
// .provisionVenue), and a brand-new venue starts from the zeroed shapes below
// so the operator dashboards render an honest "no activity yet" state.

import type {
  ChannelMixPoint,
  PeakHourPoint,
  RevenuePoint,
  Venue,
  VenueCourt,
  VenueSeed,
  VenueStats,
} from "../shared/index.js"

/** Zeroed KPIs for a freshly onboarded venue (no history yet). */
export const EMPTY_STATS: VenueStats = {
  occupancy: 0,
  occupancyDelta: 0,
  revenueToday: 0,
  revenueDelta: 0,
  bookingsToday: 0,
  bookingsDelta: 0,
  noShowRate: 0,
  noShowDelta: 0,
  newCustomers: 0,
  newCustomersDelta: 0,
  utilization: 0,
}

export type VenueOps = Omit<VenueSeed, "info">

export interface VenueRecord {
  info: Venue
  ops: VenueOps
}

/** A zeroed 7-day revenue week (oldest → today) for a venue with no history. */
const EMPTY_REVENUE_SERIES: RevenuePoint[] = [
  { label: { en: "Mon", vi: "T2" }, value: 0 },
  { label: { en: "Tue", vi: "T3" }, value: 0 },
  { label: { en: "Wed", vi: "T4" }, value: 0 },
  { label: { en: "Thu", vi: "T5" }, value: 0 },
  { label: { en: "Fri", vi: "T6" }, value: 0 },
  { label: { en: "Sat", vi: "T7" }, value: 0 },
  { label: { en: "Sun", vi: "CN" }, value: 0 },
]

/** The standard booking channels at 0% — the analytics/Copilot panels index [0]. */
const EMPTY_CHANNEL_MIX: ChannelMixPoint[] = [
  { source: "app", pct: 0 },
  { source: "walk-in", pct: 0 },
]

/** The usual prime-time hours at 0% util — the panels index [0]. */
const EMPTY_PEAK_HOURS: PeakHourPoint[] = [
  { hour: "19:00", util: 0 },
  { hour: "20:00", util: 0 },
  { hour: "18:00", util: 0 },
  { hour: "21:00", util: 0 },
]

/**
 * Operator bundle for a venue with no activity yet. The chart series are
 * structurally valid but zeroed so the dashboards render an honest "no activity"
 * state instead of crashing when they index `[length-1]` / `[0]` into them
 * (the operator views assume flagship-shaped data). Reservations / customers /
 * insights stay genuinely empty — those views have real empty-state UI. New
 * objects per call so the in-memory store never shares mutable rows across venues.
 */
export function emptyOps(courts: VenueCourt[] = []): VenueOps {
  const sports = [...new Set(courts.map((c) => c.sport))]
  return {
    stats: { ...EMPTY_STATS },
    courts,
    reservations: [],
    refundQueue: [],
    customers: [],
    blocks: [],
    revenueSeries: EMPTY_REVENUE_SERIES.map((p) => ({ ...p })),
    sportMix: sports.map((sport) => ({ sport, bookings: 0, pct: 0 })),
    channelMix: EMPTY_CHANNEL_MIX.map((p) => ({ ...p })),
    peakHours: EMPTY_PEAK_HOURS.map((p) => ({ ...p })),
    insights: [],
  }
}
