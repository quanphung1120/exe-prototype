// MongoDB-backed venue service. Each operator venue is one document holding the
// whole `VenueRecord` ({ info, ops }); the collection is seeded from the
// hardcoded `INITIAL_VENUES` the first time it's read (idempotent), so a fresh
// database boots with the demo venues and every mutation below persists across
// restarts. Reads load lean plain objects; writes load the hydrated document,
// mutate the touched branch, `markModified(...)` it (both `info` and `ops` are
// Mixed sub-documents) and `save()`.

import {
  VENUE_DAYS,
  diffMinutes,
  initialsOf,
  priceFor,
  rangesOverlap,
  slotRange,
  toMinutes,
  type Reservation,
  type SportKey,
  type Venue,
  type VenueCourt,
  type VenueSeed,
} from "@repo/shared"

import { emptyOps, INITIAL_VENUES, type VenueRecord } from "../data/venue.js"
import { connectDb } from "../db.js"
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js"
import { VenueModel, type VenueDoc } from "../models/venue.js"
import { isDuplicateKeyError, once } from "./mongo-util.js"

// ── Seeding ──────────────────────────────────────────────────────────────────

// Memoize the one-time seed so concurrent first-requests don't each try to
// insert the demo venues (which would collide on the unique `venueId` index).
// See court-service for why `once` (retry on transient failure) + `ordered:
// false` (no permanently-partial seed).
const ensureSeeded = once(async () => {
  await connectDb()
  if ((await VenueModel.countDocuments()) > 0) return
  try {
    await VenueModel.insertMany(
      INITIAL_VENUES.map((rec) => ({
        venueId: rec.info.id,
        info: rec.info,
        ops: rec.ops,
      })),
      { ordered: false }
    )
  } catch (err) {
    // A concurrent seeder (e.g. another process) may have inserted first;
    // a duplicate-key race is benign — the venues exist either way.
    if (!isDuplicateKeyError(err)) throw err
  }
})

/**
 * Run a find→mutate→save mutation, retrying on a Mongoose `VersionError`. Both
 * `info` and `ops` are Mixed, so a `save()` rewrites the whole branch — two
 * concurrent writers who each loaded the same snapshot would otherwise have the
 * later save silently clobber the earlier one (a lost update that also defeats
 * the walk-in overlap guard). With `optimisticConcurrency` on the venue schema
 * the stale save throws `VersionError` instead; re-running reloads the fresh doc
 * and re-applies the change against it, so concurrent writes compose.
 */
async function withVersionRetry<T>(
  mutate: () => Promise<T>,
  tries = 4
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mutate()
    } catch (err) {
      const isVersionConflict =
        err instanceof Error && err.name === "VersionError"
      if (!isVersionConflict || attempt >= tries) throw err
    }
  }
}

// ── Document helpers ─────────────────────────────────────────────────────────

// Insertion order = venue order (the first venue is the default). insertMany
// assigns ascending _ids in array order and stamps the same createdAt, so
// sorting by _id ascending recovers seed order and keeps new venues last.
const ORDER = { createdAt: 1, _id: 1 } as const

/** The hydrated document for a venue id (for mutation), or null. */
function findDoc(id: string) {
  return VenueModel.findOne({ venueId: id })
}

/** All records as plain VenueRecords, in venue order. */
async function loadRecords(): Promise<VenueRecord[]> {
  const docs = await VenueModel.find().sort(ORDER).lean<VenueDoc[]>()
  return docs.map((d) => ({ info: d.info, ops: d.ops }))
}

async function firstRecord(): Promise<VenueRecord> {
  const doc = await VenueModel.findOne().sort(ORDER).lean<VenueDoc>()
  // The store is always seeded before this runs, so a venue always exists.
  return { info: doc!.info, ops: doc!.ops }
}

/** Largest numeric suffix among ids shaped `${prefix}<n>` (0 when none match). */
function maxSeq(ids: string[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  return ids.reduce((max, id) => {
    const m = re.exec(id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

// ── Reservation-time helpers (unchanged, pure) ───────────────────────────────

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

// `toMinutes` / `rangesOverlap` are imported from @repo/shared (same helpers the
// rest of the app uses) rather than re-implemented here.

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every venue's profile (no operator bundle) — for the switcher and manager. */
export async function listVenues(): Promise<Venue[]> {
  await ensureSeeded()
  return (await loadRecords()).map((r) => r.info)
}

/** The active venue's full operator bundle (the seed's `venue` payload). */
export async function activeBundle(id?: string): Promise<VenueSeed> {
  await ensureSeeded()
  const doc = id ? await findDoc(id).lean<VenueDoc>() : null
  const rec = doc ? { info: doc.info, ops: doc.ops } : await firstRecord()
  return { info: rec.info, ...rec.ops }
}

/**
 * A specific venue's full operator bundle. Unlike `activeBundle`, this never
 * falls back to the first venue — a stale/typo'd id throws `NotFoundError` (→
 * 404) so the per-venue workspace shows not-found rather than silently rendering
 * another venue's data under the wrong URL.
 */
export async function venueBundle(id: string): Promise<VenueSeed> {
  await ensureSeeded()
  const doc = await findDoc(id).lean<VenueDoc>()
  if (!doc) throw new NotFoundError("Venue not found")
  return { info: doc.info, ...doc.ops }
}

export async function getVenue(id: string): Promise<Venue> {
  await ensureSeeded()
  const doc = await findDoc(id).lean<VenueDoc>()
  if (!doc) throw new NotFoundError("Venue not found")
  return doc.info
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

export async function createVenue(input: VenueInput): Promise<Venue> {
  await ensureSeeded()
  // Two concurrent creates can compute the same `v<n>` id; the unique index
  // rejects the loser with a duplicate-key error. Recompute and retry a few
  // times rather than surfacing that race as a 500.
  for (let attempt = 1; ; attempt++) {
    const ids = (await VenueModel.distinct("venueId")) as string[]
    const info: Venue = {
      id: `v${maxSeq(ids, "v") + 1}`,
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
    try {
      await VenueModel.create({ venueId: info.id, info, ops: emptyOps([]) })
      return info
    } catch (err) {
      if (isDuplicateKeyError(err) && attempt < 5) continue
      throw err
    }
  }
}

export async function updateVenue(
  id: string,
  patch: Partial<VenueInput>
): Promise<Venue> {
  await ensureSeeded()
  return withVersionRetry(async () => {
    const doc = await findDoc(id)
    if (!doc) throw new NotFoundError("Venue not found")
    const next = doc.info
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
    doc.markModified("info")
    await doc.save()
    return doc.info
  })
}

export async function removeVenue(id: string): Promise<void> {
  await ensureSeeded()
  if (!(await VenueModel.exists({ venueId: id })))
    throw new NotFoundError("Venue not found")
  // Never delete the operator's only venue — the workspace needs a fallback.
  if ((await VenueModel.countDocuments()) <= 1)
    throw new BadRequestError("Cannot delete the only venue")
  await VenueModel.deleteOne({ venueId: id })
}

// ── Court mutations (scoped to a venue) ──────────────────────────────────────

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
}

export async function addCourt(
  venueId: string,
  input: CourtInput
): Promise<VenueCourt> {
  await ensureSeeded()
  return withVersionRetry(async () => {
    const doc = await findDoc(venueId)
    if (!doc) throw new NotFoundError("Venue not found")
    // Persisted high-water counter, seeded from the current max, so a court id
    // is never reused after a deletion — otherwise a freed `vcN` handed back
    // out could silently re-link an orphaned reservation still referencing it
    // to a different, newly-added court.
    const seq =
      Math.max(
        doc.courtSeq ?? 0,
        maxSeq(
          doc.ops.courts.map((c) => c.id),
          "vc"
        )
      ) + 1
    doc.courtSeq = seq
    const court: VenueCourt = {
      id: `vc${seq}`,
      name: input.name,
      sport: input.sport,
      surface: input.surface,
      state: input.state ?? "available",
      utilToday: 0,
      pricePerHour: input.pricePerHour,
    }
    doc.ops.courts.push(court)
    doc.markModified("ops")
    await doc.save()
    return court
  })
}

export async function updateCourt(
  venueId: string,
  courtId: string,
  patch: Partial<CourtInput>
): Promise<VenueCourt> {
  await ensureSeeded()
  return withVersionRetry(async () => {
    const doc = await findDoc(venueId)
    const court = doc?.ops.courts.find((c) => c.id === courtId)
    if (!doc || !court) throw new NotFoundError("Court not found")
    if (patch.name !== undefined) court.name = patch.name
    if (patch.sport !== undefined) court.sport = patch.sport
    if (patch.surface !== undefined) court.surface = patch.surface
    if (patch.pricePerHour !== undefined)
      court.pricePerHour = patch.pricePerHour
    if (patch.state !== undefined) court.state = patch.state
    doc.markModified("ops")
    await doc.save()
    return court
  })
}

export async function removeCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await ensureSeeded()
  await withVersionRetry(async () => {
    const doc = await findDoc(venueId)
    if (!doc) throw new NotFoundError("Court not found")
    const before = doc.ops.courts.length
    doc.ops.courts = doc.ops.courts.filter((c) => c.id !== courtId)
    if (doc.ops.courts.length === before)
      throw new NotFoundError("Court not found")
    doc.markModified("ops")
    await doc.save()
  })
}

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

export async function addWalkInReservation(
  venueId: string,
  input: WalkInReservationInput
): Promise<Reservation> {
  await ensureSeeded()
  // The whole find→validate→conflict-check→save runs inside the retry: on a
  // version conflict (a concurrent reservation landed first) we reload and
  // re-run the overlap guard against the fresh reservation list, so two
  // concurrent walk-ins for the same slot can't both pass and double-book.
  return withVersionRetry(async () => {
    const doc = await findDoc(venueId)
    if (!doc) throw new NotFoundError("Court or venue not found")

    const court = doc.ops.courts.find((item) => item.id === input.courtId)
    if (!court) throw new NotFoundError("Court or venue not found")
    if (court.state === "maintenance") {
      throw new BadRequestError("Court is under maintenance")
    }

    const openFrom = toMinutes(doc.info.openFrom)
    const openTo = toMinutes(doc.info.openTo)
    const startMin = toMinutes(input.start)
    const endMin = startMin + input.durationMin
    if (input.durationMin < 15 || input.durationMin % 15 !== 0) {
      throw new BadRequestError("Duration must be in 15-minute steps")
    }
    if (startMin < openFrom || endMin > openTo) {
      throw new BadRequestError("Walk-in must stay within venue opening hours")
    }

    const conflict = doc.ops.reservations.some((reservation) => {
      if ((reservation.courtId ?? "") !== input.courtId) return false
      if (reservationDayKey(reservation) !== input.dayKey) return false
      if (
        reservation.status === "cancelled" ||
        reservation.status === "no-show"
      )
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
      throw new ConflictError("Selected time overlaps an existing reservation")
    }

    const day = VENUE_DAYS.find((item) => item.key === input.dayKey)?.label ?? {
      en: input.dayKey,
      vi: input.dayKey,
    }
    // Persisted high-water counter (see addCourt) so a reservation id is never
    // reused after a deletion.
    const seq =
      Math.max(
        doc.reservationSeq ?? 0,
        maxSeq(
          doc.ops.reservations.map((r) => r.id),
          "rv"
        )
      ) + 1
    doc.reservationSeq = seq
    const reservation: Reservation = {
      id: `rv${seq}`,
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
      price: priceFor(court.pricePerHour, input.durationMin),
      noShowRisk: 5,
      isRegular: false,
    }
    doc.ops.reservations.push(reservation)
    doc.markModified("ops")
    await doc.save()
    return reservation
  })
}
