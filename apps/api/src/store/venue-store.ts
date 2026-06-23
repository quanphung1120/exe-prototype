// In-memory venue store. The prototype has no database, so the operator's
// venues live here as mutable state initialized from the hardcoded seed. CRUD
// mutations persist for the life of the process (a restart — e.g. `tsx watch`
// reloading — resets everything back to the seed).

import {
  initialsOf,
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

function find(id: string): VenueRecord | undefined {
  return venues.find((v) => v.info.id === id)
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
