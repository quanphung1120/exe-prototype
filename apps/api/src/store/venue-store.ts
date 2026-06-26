// In-memory venue store. The prototype has no database, so the operator's
// venues live here as mutable state initialized from the hardcoded seed. CRUD
// mutations persist for the life of the process (a restart — e.g. `tsx watch`
// reloading — resets everything back to the seed).

import {
  VENUE_DAYS,
  diffMinutes,
  initialsOf,
  slotRange,
  type Reservation,
  type SportKey,
  type Venue,
  type VenueCourt,
  type VenueSeed,
} from "@repo/shared"

import { emptyOps, INITIAL_VENUES, type VenueRecord } from "../data/venue.js"

// Deep-clone the seed so mutations never leak back into the imported constants
// (the records are plain JSON, so a round-trip is a sufficient deep copy).
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

let venues: VenueRecord[] = clone(INITIAL_VENUES)

// Monotonic id counters, started past the seed ids so generated ids never clash.
let venueSeq = venues.length
let courtSeq = 1000
let reservationSeq = venues.reduce(
  (max, venue) =>
    Math.max(
      max,
      ...venue.ops.reservations.map((reservation) => {
        const match = /^rv(\d+)$/.exec(reservation.id)
        return match ? Number(match[1]) : 0
      })
    ),
  0
)

function find(id: string): VenueRecord | undefined {
  return venues.find((v) => v.info.id === id)
}

const TIME_RANGE_RE = /(\d{2}:\d{2})/g

function reservationDayKey(reservation: Reservation): string {
  if (reservation.dayKey) return reservation.dayKey
  return (
    VENUE_DAYS.find((day) => day.label.en === reservation.day.en)?.key ?? "past"
  )
}

function reservationStart(reservation: Reservation): string | null {
  if (reservation.start) return reservation.start
  const [start] = reservation.time.match(TIME_RANGE_RE) ?? []
  return start ?? null
}

function reservationDuration(reservation: Reservation): number {
  if (reservation.durationMin) return reservation.durationMin
  const [start, end] = reservation.time.match(TIME_RANGE_RE) ?? []
  if (!start || !end) return 60
  return Math.max(15, diffMinutes(start, end))
}

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function rangesOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const a = toMinutes(startA)
  const b = toMinutes(startB)
  return a < b + durationB && b < a + durationA
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every venue's profile (no operator bundle) — for the switcher and manager. */
export function listVenues(): Venue[] {
  return venues.map((v) => v.info)
}

/** Resolve a requested active venue id to one that exists (falls back to first). */
export function resolveActiveId(id?: string): string {
  return (id && find(id)?.info.id) || venues[0]!.info.id
}

/** The active venue's full operator bundle (the seed's `venue` payload). */
export function activeBundle(id?: string): VenueSeed {
  const rec = (id && find(id)) || venues[0]!
  return { info: rec.info, ...rec.ops }
}

/**
 * A specific venue's full operator bundle, or `undefined` when the id is
 * unknown. Unlike `activeBundle`, this never falls back to the first venue —
 * the per-venue workspace must 404 on a stale/typo'd id, not silently render
 * another venue's data under the wrong URL.
 */
export function venueBundle(id: string): VenueSeed | undefined {
  const rec = find(id)
  return rec ? { info: rec.info, ...rec.ops } : undefined
}

export function getVenue(id: string): Venue | undefined {
  return find(id)?.info
}

// ── Venue mutations ──────────────────────────────────────────────────────────

export interface VenueInput {
  name: string
  image?: string
  description?: string
  district: string
  city: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  managerName: string
}

export function createVenue(input: VenueInput): Venue {
  const info: Venue = {
    id: `v${++venueSeq}`,
    name: input.name,
    initials: initialsOf(input.name),
    image: input.image,
    description: input.description,
    district: input.district,
    city: input.city,
    sports: input.sports,
    openFrom: input.openFrom,
    openTo: input.openTo,
    rating: 0,
    reviews: 0,
    manager: {
      name: input.managerName,
      initials: initialsOf(input.managerName),
    },
    now: "18:00",
  }
  venues.push({ info, ops: emptyOps([]) })
  return info
}

export function updateVenue(
  id: string,
  patch: Partial<VenueInput>
): Venue | undefined {
  const rec = find(id)
  if (!rec) return undefined
  const next = rec.info
  if (patch.name !== undefined) {
    next.name = patch.name
    next.initials = initialsOf(patch.name)
  }
  if (patch.image !== undefined) next.image = patch.image
  if (patch.description !== undefined) next.description = patch.description
  if (patch.district !== undefined) next.district = patch.district
  if (patch.city !== undefined) next.city = patch.city
  if (patch.sports !== undefined) next.sports = patch.sports
  if (patch.openFrom !== undefined) next.openFrom = patch.openFrom
  if (patch.openTo !== undefined) next.openTo = patch.openTo
  if (patch.managerName !== undefined) {
    next.manager = {
      name: patch.managerName,
      initials: initialsOf(patch.managerName),
    }
  }
  return next
}

export type RemoveResult = "ok" | "not-found" | "last"

export function removeVenue(id: string): RemoveResult {
  if (!find(id)) return "not-found"
  if (venues.length <= 1) return "last"
  venues = venues.filter((v) => v.info.id !== id)
  return "ok"
}

// ── Court mutations (scoped to a venue) ──────────────────────────────────────

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
}

export function addCourt(
  venueId: string,
  input: CourtInput
): VenueCourt | undefined {
  const rec = find(venueId)
  if (!rec) return undefined
  const court: VenueCourt = {
    id: `vc${++courtSeq}`,
    name: input.name,
    sport: input.sport,
    surface: input.surface,
    state: input.state ?? "available",
    utilToday: 0,
    pricePerHour: input.pricePerHour,
  }
  rec.ops.courts.push(court)
  return court
}

export function updateCourt(
  venueId: string,
  courtId: string,
  patch: Partial<CourtInput>
): VenueCourt | undefined {
  const rec = find(venueId)
  const court = rec?.ops.courts.find((c) => c.id === courtId)
  if (!court) return undefined
  if (patch.name !== undefined) court.name = patch.name
  if (patch.sport !== undefined) court.sport = patch.sport
  if (patch.surface !== undefined) court.surface = patch.surface
  if (patch.pricePerHour !== undefined) court.pricePerHour = patch.pricePerHour
  if (patch.state !== undefined) court.state = patch.state
  return court
}

export function removeCourt(venueId: string, courtId: string): boolean {
  const rec = find(venueId)
  if (!rec) return false
  const before = rec.ops.courts.length
  rec.ops.courts = rec.ops.courts.filter((c) => c.id !== courtId)
  return rec.ops.courts.length < before
}

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

export function addWalkInReservation(
  venueId: string,
  input: WalkInReservationInput
): Reservation | undefined {
  const rec = find(venueId)
  if (!rec) return undefined

  const court = rec.ops.courts.find((item) => item.id === input.courtId)
  if (!court) return undefined
  if (court.state === "maintenance") {
    throw new Error("Court is under maintenance")
  }

  const openFrom = toMinutes(rec.info.openFrom)
  const openTo = toMinutes(rec.info.openTo)
  const startMin = toMinutes(input.start)
  const endMin = startMin + input.durationMin
  if (input.durationMin < 15 || input.durationMin % 15 !== 0) {
    throw new Error("Duration must be in 15-minute steps")
  }
  if (startMin < openFrom || endMin > openTo) {
    throw new Error("Walk-in must stay within venue opening hours")
  }

  const conflict = rec.ops.reservations.some((reservation) => {
    if ((reservation.courtId ?? "") !== input.courtId) return false
    if (reservationDayKey(reservation) !== input.dayKey) return false
    if (reservation.status === "cancelled" || reservation.status === "no-show")
      return false
    const start = reservationStart(reservation)
    if (!start) return false
    return rangesOverlap(
      input.start,
      input.durationMin,
      start,
      reservationDuration(reservation)
    )
  })
  if (conflict) {
    throw new Error("Selected time overlaps an existing reservation")
  }

  const day =
    VENUE_DAYS.find((item) => item.key === input.dayKey)?.label ?? {
      en: input.dayKey,
      vi: input.dayKey,
    }
  const reservation: Reservation = {
    id: `rv${++reservationSeq}`,
    customer: {
      name: input.customerName.trim(),
      initials: initialsOf(input.customerName),
      phone: input.customerPhone.trim(),
    },
    sport: court.sport,
    courtId: court.id,
    court: court.name,
    dayKey: input.dayKey,
    day,
    start: input.start,
    durationMin: input.durationMin,
    time: slotRange(input.start, input.durationMin),
    party: court.sport === "pickleball" ? 4 : 2,
    source: "walk-in",
    status: "confirmed",
    price: Math.round((court.pricePerHour * input.durationMin) / 60),
    noShowRisk: 5,
    isRegular: false,
  }
  rec.ops.reservations.push(reservation)
  return reservation
}
