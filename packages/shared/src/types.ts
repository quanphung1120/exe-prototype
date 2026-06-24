// Shared entity types for SportMatch AI — consumed by both `apps/api` (which
// owns the hardcoded records and types its data with these) and `apps/web`
// (which fetches those records and renders them). Pure type declarations only;
// no runtime values live here.

// ── Sports ───────────────────────────────────────────────────────────────────

export type SportKey = "pickleball" | "badminton"

export interface Sport {
  key: SportKey
  label: string
  short: string
  /** Tailwind background class used for the sport's accent dot/tag. */
  accent: string
}

// ── Skill levels ─────────────────────────────────────────────────────────────

/** Self-declared skill level. The platform never computes or changes this. */
export type Level = "beginner" | "intermediate" | "advanced"
/** A room targets one level, or welcomes any level. */
export type RoomLevel = Level | "any"

// ── The player (current user) ────────────────────────────────────────────────

export interface User {
  name: string
  first: string
  initials: string
  handle: string
  city: string
  /** Default self-declared level; mutable at runtime via the sidebar picker. */
  level: Level
  /** Reliability/reputation score, 0–100. */
  trust: number
}

// ── Players & roster ─────────────────────────────────────────────────────────

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

/** A participant resolvable from a match room's `players` initials. */
export interface RosterEntry {
  name: string
  initials: string
  /** Self-declared level. For the user, the live value comes from the provider. */
  level: Level
  /** Reliability/reputation score, 0–100. */
  trust: number
}

export type TrustTier = "trusted" | "reliable" | "new"

// ── Courts ───────────────────────────────────────────────────────────────────

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
  /** Geographic position for the Find Courts map (WGS84). */
  lat: number
  lng: number
}

// ── Match rooms (Match Maker lobbies) ────────────────────────────────────────

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
  /** Canonical BOOKING_DAYS key for `day` (set on create; derived otherwise). */
  dayKey?: string
  time: string
  /** Level the room is for (or "any"). A stated preference, not a hard gate. */
  level: RoomLevel
  /** Total seats including the host. */
  capacity: number
  /** Seats already taken. `players` holds their initials. */
  joined: number
  players: string[]
  pricePerHour: number
  /** Session length in minutes; derived from `time` when omitted. */
  durationMin?: number
  /** Set once a court has been booked for this room. */
  bookingId?: string
}

// ── Bookings ─────────────────────────────────────────────────────────────────

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

// ── Play sessions ────────────────────────────────────────────────────────────

/**
 * RSVP state of a session participant.
 * - `requested`: asked to join and is awaiting the host's approval (the host
 *   reviews their reliability before letting them in).
 * - `pending`: invited by the host and awaiting their own RSVP.
 */
export type Rsvp = "host" | "going" | "requested" | "pending" | "declined"

export interface SessionPlayer {
  name: string
  initials: string
  rsvp: Rsvp
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
  /** Session length in minutes. Free-form (e.g. 65); defaults to 60. */
  durationMin: number
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

export type Conflict = "court-taken" | "self-overlap" | null

export interface ConflictQuery {
  courtId: string | null
  dayKey: string
  slot: string | null
  /** Requested length in minutes (the booking need not align to the hour). */
  durationMin: number
  /** Session being (re)booked — excluded from the check. */
  ignoreId?: string
}

// ── Chat ─────────────────────────────────────────────────────────────────────

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

export interface Message {
  id: string
  mine: boolean
  author: string
  text: string
  time: string
}

// ── Streak & stats ───────────────────────────────────────────────────────────

export interface StreakDay {
  day: string
  active: boolean
  sport: SportKey | null
  today?: boolean
}

export interface Streak {
  current: number
  longest: number
  weeklyGoal: number
  weeklyDone: number
  /** Last seven days, oldest → today. */
  week: StreakDay[]
  /** 12 weeks × 7 days of activity intensity (0–3) for the heatmap, oldest first. */
  history: number[]
}

export interface Stats {
  matches: number
  winRate: number
  hours: number
  hoursDelta: number
}

// ── Activity feed ────────────────────────────────────────────────────────────

export type ActivityKind = "match-found" | "win" | "loss" | "booking" | "rating"

export interface ActivityItem {
  id: string
  kind: ActivityKind
  text: string
  time: string
}

// ── Notifications ────────────────────────────────────────────────────────────

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

// ── Venue: localized content ─────────────────────────────────────────────────

export interface Localized {
  en: string
  vi: string
}
export interface LocalizedList {
  en: string[]
  vi: string[]
}

// ── Venue: the venue itself ──────────────────────────────────────────────────

export interface Venue {
  /** Stable id (the operator may run several venues). */
  id: string
  name: string
  initials: string
  /** Optional profile photo URL (operator-set; the UI falls back to initials). */
  image?: string
  /** Optional short description shown on the venue profile. */
  description?: string
  district: string
  city: string
  /** Sports played at this center. */
  sports: SportKey[]
  openFrom: string
  openTo: string
  rating: number
  reviews: number
  manager: { name: string; initials: string }
  /** A fixed "current time" so the live views read coherently (no real clock). */
  now: string
}

// ── Venue: physical courts ───────────────────────────────────────────────────

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

// ── Venue: headline KPIs ─────────────────────────────────────────────────────

export interface VenueStats {
  /** Share of court-hours sold today, 0–100. */
  occupancy: number
  occupancyDelta: number
  /** Revenue booked today, VND. */
  revenueToday: number
  revenueDelta: number
  bookingsToday: number
  bookingsDelta: number
  /** No-show rate over the trailing 30 days, %. */
  noShowRate: number
  noShowDelta: number
  newCustomers: number
  newCustomersDelta: number
  /** Trailing-7-day average utilization, %. */
  utilization: number
}

// ── Venue: schedule grid ─────────────────────────────────────────────────────

export type SlotKind = "free" | "booked" | "blocked" | "walk-in"

export interface ScheduleSlot {
  courtId: string
  hour: string
  kind: SlotKind
  customer?: string
  sport: SportKey
  party?: number
  /** True for hours before {@link Venue.now} on the "today" column. */
  past?: boolean
}

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

// ── Venue: reservations ──────────────────────────────────────────────────────

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

export type RiskTier = "low" | "medium" | "high"

// ── Venue: customers (CRM) ───────────────────────────────────────────────────

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

// ── Venue: analytics series ──────────────────────────────────────────────────

export interface RevenuePoint {
  label: Localized
  value: number
}

export interface SportMixPoint {
  sport: SportKey
  bookings: number
  pct: number
}

export interface ChannelMixPoint {
  source: BookingSource
  pct: number
}

export interface PeakHourPoint {
  hour: string
  util: number
}

// ── Venue: AI monitor insights ───────────────────────────────────────────────

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
  /**
   * When set, this insight is a simple adaptive-pricing move — raise or lower
   * the hourly rate. Drives the minimal AI price-suggestions sheet in analytics.
   */
  priceMove?: {
    direction: "up" | "down"
    /** Magnitude of the change as a percentage (e.g. 10 for ±10%). */
    pct: number
    /** Current and suggested price per hour, VND. */
    from: number
    to: number
  }
  /** Signed nudge applied to a KPI when the action is taken. */
  effect?: {
    metric: "revenueToday" | "occupancy" | "noShowRate"
    delta: number
  }
}

// ── The seed payload (what the API serves & the web hydrates) ─────────────────

/** Everything the venue workspace needs, served under the seed's `venue` key. */
export interface VenueSeed {
  info: Venue
  stats: VenueStats
  courts: VenueCourt[]
  reservations: Reservation[]
  customers: VenueCustomer[]
  revenueSeries: RevenuePoint[]
  sportMix: SportMixPoint[]
  channelMix: ChannelMixPoint[]
  peakHours: PeakHourPoint[]
  insights: VenueInsight[]
}

/** The full hardcoded dataset the API serves and the web `DataProvider` holds. */
export interface Seed {
  user: User
  players: Player[]
  courts: Court[]
  rooms: MatchRoom[]
  bookings: Booking[]
  /** Derived seed (built from rooms + bookings) so the web hydrates it directly. */
  sessions: PlaySession[]
  chats: Chat[]
  thread: Message[]
  streak: Streak
  stats: Stats
  activity: ActivityItem[]
  notifications: NotificationItem[]
  /** Every venue the operator manages (profiles only — for the switcher/manager). */
  venues: Venue[]
  /** Which venue {@link Seed.venue} is the bundle for. */
  activeVenueId: string
  /** The active venue's full operator bundle (stats, courts, reservations, …). */
  venue: VenueSeed
}
