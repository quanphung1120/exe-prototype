// Shared entity types for SportMatch AI — consumed by both `api` (which
// owns the hardcoded records and types its data with these) and `web`
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
  /** Cấp quận/huyện — full Vietnamese name e.g. "Quận 1", "Quận Bình Thạnh", "Thành phố Thủ Đức" */
  district: string
  /** Tỉnh/thành phố trực thuộc trung ương — e.g. "TP. Hồ Chí Minh", "Hà Nội" */
  city: string
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
  /** ISO date ("YYYY-MM-DD") for `day` (set on create; derived otherwise). */
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
  /** ISO date ("YYYY-MM-DD") for new bookings; absent on legacy seed records. */
  dayKey?: string
  time: string
  status: BookingStatus
  withPlayers: BookingPlayer[]
  /** Linked match room, when the booking created or belongs to one. */
  roomId?: string
  pricePerHour: number
  /** Operator's decline reason (projected from the session), shown when cancelled. */
  declineReason?: string
  /** Simulated pre-paid refund marker (projected from the session). */
  refunded?: boolean
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
  /** Epoch ms when the current `requested`/`pending` rsvp was set (expiry). */
  rsvpAt?: number
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
  /** ISO date ("YYYY-MM-DD"), Asia/Ho_Chi_Minh. A date before "today" is history and never blocks. */
  dayKey: string
  /** Display label for the day (kept verbatim for seed history). */
  dayLabel: string
  /** "HH:MM" start — proposed while forming, held once booked. */
  slot: string | null
  /** Session length in minutes. Free-form (e.g. 65); defaults to 60. */
  durationMin: number
  /** ISO datetime (+07:00) for `dayKey`/`slot` once booked — combineDateTime(dayKey, slot). */
  startAt?: string
  /** ISO datetime (+07:00), startAt + durationMin. */
  endAt?: string
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
  /**
   * Epoch ms deadline for an unpaid court hold: once a court+slot is picked
   * (still `forming`), the slot is reserved until this time — see
   * {@link courtHolds}/{@link conflictFor}. Cleared once booked or released.
   */
  holdExpiresAt?: number
  /** Owning venue of the held court — set when a booking cross-writes a reservation. */
  venueId?: string
  /** Linked BookingRecord id (idempotency key for the cross-write; also the id a Reservation projects). */
  reservationId?: string
  /** Operator's decline reason, surfaced to the player once cancelled. */
  cancelReason?: string
  /** Simulated pre-paid refund marker, set when an app booking is declined. */
  refunded?: boolean
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
  /** Stable id. Each account owns at most one venue (see `ownerId`). */
  id: string
  /** Clerk account that owns this venue (absent on ownerless demo seeds). */
  ownerId?: string
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
  /** Geographic position for the Find Courts map (WGS84); courts inherit it. */
  lat?: number
  lng?: number
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
  customerPhone?: string
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
  customer: { name: string; initials: string; phone?: string }
  /** Clerk account of the app booker (absent for walk-ins). */
  userId?: string
  /** Linked player PlaySession id (absent for walk-ins). */
  sessionId?: string
  sport: SportKey
  courtId?: string
  court: string
  /** ISO date ("YYYY-MM-DD"), Asia/Ho_Chi_Minh — the source of truth for the day. */
  dayKey?: string
  day: Localized
  start?: string
  durationMin?: number
  time: string
  /** ISO datetime (+07:00) — combineDateTime(dayKey, start). */
  startAt?: string
  /** ISO datetime (+07:00), startAt + durationMin. */
  endAt?: string
  party: number
  source: BookingSource
  status: ReservationStatus
  price: number
  /** AI-estimated no-show probability, 0–100. */
  noShowRisk: number
  isRegular: boolean
  /** Operator's reason when this app reservation is declined (status "cancelled"). */
  declineReason?: string
}

export type RiskTier = "low" | "medium" | "high"

// ── Bookings: the canonical entity (booking ≡ reservation, one record) ────────

/**
 * Lifecycle of a {@link BookingRecord}. `awaiting_payment`/`expired` are the
 * payment-gate states a future phase (SePay checkout) will drive; today's write
 * paths (app cross-write, walk-in) skip straight to `pending`/`confirmed` since
 * no real payment gate exists yet — the states exist now so the schema and the
 * transition table don't need to change shape when that phase lands.
 */
export type BookingRecordStatus =
  | "awaiting_payment"
  | "pending"
  | "confirmed"
  | "checked-in"
  | "completed"
  | "expired"
  | "cancelled"
  | "no-show"

/**
 * Pre-paid settlement state of a {@link BookingRecord}. `none` is walk-ins (cash
 * at the venue, never gated on payment); the rest describe an app booking's
 * SePay checkout lifecycle (a future phase).
 */
export type PaymentStatus =
  "awaiting" | "paid" | "refunded" | "partial_refund" | "none"

export interface BookingCustomer {
  name: string
  initials: string
  phone?: string
}

/**
 * A refund SePay can't issue itself (no refund API — only `voidTransaction`/
 * `cancel` for a not-yet-settled transaction/order). Recording one here queues
 * it onto the operator's manual-refund worklist (a bank transfer done by
 * hand); `status` is always `"manual"` today — the field exists so a future
 * phase that adds a real payout rail doesn't need to reshape this type.
 */
export interface BookingRefund {
  /** Percent of the price refunded (100/50/0 per the cancellation policy). */
  pct: number
  amount: number
  /** ISO datetime the refund was recorded. */
  at: string
  /** How the refund is settled — manual bank transfer by an operator. */
  status: "manual"
  /** Manual transfer reference, once an operator completes it. */
  ref?: string
}

export interface BookingStatusEvent {
  status: BookingRecordStatus
  /** ISO datetime (+07:00). */
  at: string
  reason?: string
}

/**
 * The canonical booking — the single record a court hold, a player's app
 * booking and a venue's operator-facing reservation all converge on (one court-
 * time slot, one row). `api/src/features/bookings/` owns the collection; the
 * venue operator's `Reservation[]` (see {@link Reservation}) is a read-time
 * projection of these, and a player's `PlaySession` derives its booking-facing
 * status/hold/refund fields from whichever record its `reservationId` points at.
 */
export interface BookingRecord {
  bookingId: string
  venueId: string
  courtId: string
  /** Denormalized so a Reservation projection never needs a courts join. */
  courtName: string
  sport: SportKey
  source: BookingSource
  /** Clerk account of the app booker (absent for walk-ins). */
  userId?: string
  /** Linked player PlaySession id (absent for walk-ins). */
  sessionId?: string
  customer: BookingCustomer
  /** ISO datetime (+07:00) — combineDateTime(dateKey, start). */
  startAt: string
  /** ISO datetime (+07:00), startAt + durationMin. */
  endAt: string
  /** ISO date ("YYYY-MM-DD"), Asia/Ho_Chi_Minh — the source of truth for the day. */
  dateKey: string
  start: string
  durationMin: number
  price: number
  status: BookingRecordStatus
  paymentStatus: PaymentStatus
  /** Epoch-free ISO deadline for an unpaid court hold (awaiting_payment → expired). */
  holdExpiresAt?: string
  /** ISO deadline for the venue's 30-minute approval SLA (pending → auto-confirmed). */
  confirmDeadlineAt?: string
  /** ISO datetime the venue checked the customer in. */
  checkedInAt?: string
  /** Operator's reason when declined (status "cancelled" from "pending"). */
  declineReason?: string
  /** Player's or operator's reason for a post-confirm cancellation. */
  cancelReason?: string
  refund?: BookingRefund
  statusHistory: BookingStatusEvent[]
}

// ── Venue: customers (CRM) ───────────────────────────────────────────────────

export type CustomerTier = "vip" | "regular" | "new" | "at-risk"

export interface VenueCustomer {
  /** Phone number for walk-ins; the Clerk userId for linked app bookers. */
  id: string
  /** Set when this CRM row is a linked app booker (walk-ins keep a phone id). */
  userId?: string
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

// ── Account type ──────────────────────────────────────────────────────────────

/** What an account is: a player, a venue operator, or both. */
export const ACCOUNT_TYPES = ["player", "venue", "both"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

// ── Player skills assessment ─────────────────────────────────────────────────

/** The sports a player can self-assess (the app's racquet sports). */
export type AssessmentSport = Extract<SportKey, "badminton" | "pickleball">

/** A player's computed result for one sport. */
export interface SportAssessmentResult {
  sport: AssessmentSport
  score: number
  levelLabel: string
  bucket: Level
  /** questionId → chosen answer key, so the wizard can restore prior answers. */
  answers: Record<string, string>
}

/**
 * A player's completed skills self-assessment. Persisted per Clerk user (Mongo,
 * layered into the seed) with `localStorage` as a client cache — the many
 * synchronous readers (matchmaking, profile, gate) read the cache, which the
 * dashboard hydrates from the server value on load.
 */
export interface PlayerAssessment {
  version: 1
  completedAt: string
  selectedSports: AssessmentSport[]
  results: Record<AssessmentSport, SportAssessmentResult | undefined>
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
  /** Server "now" (ISO datetime, +07:00, Asia/Ho_Chi_Minh) — the render anchor for day math (repo bans `Date.now()` in render). */
  serverNow: string
  user: User
  players: Player[]
  courts: Court[]
  rooms: MatchRoom[]
  bookings: Booking[]
  /** Derived seed (built from rooms + bookings) so the web hydrates it directly. */
  sessions: PlaySession[]
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
  /** The signed-in player's persisted skills assessment (null until they take it). */
  assessment: PlayerAssessment | null
  /** Effective account type (stored choice ∪ inferred facts); null until chosen. */
  accountType: AccountType | null
}
