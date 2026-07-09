import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  VENUE_DAYS,
  diffMinutes,
  initialsOf,
  priceFor,
  rangesOverlap,
  slotRange,
  toMinutes,
  type Reservation,
  type ReservationStatus,
  type SportKey,
  type Venue as VenueInfo,
  type VenueCourt,
  type VenueCustomer,
  type VenueSeed,
} from "../../shared/index.js"

import {
  emptyOps,
  INITIAL_VENUES,
  type VenueRecord,
} from "../../data/venue.js"
import { isDuplicateKeyError, once } from "../../common/mongo-util.js"
import { Venue, type VenueDocument } from "./venue.schema.js"

// ── Inputs ─────────────────────────────────────────────────────────────────

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

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
}

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

export interface RescheduleReservationInput {
  dayKey: string
  start: string
  durationMin: number
}

export interface CustomerInput {
  name: string
  phone: string
  favoriteSport: SportKey
}

// Insertion order = venue order (the first venue is the default). Sorting by
// createdAt/_id ascending recovers seed order and keeps new venues last.
const ORDER = { createdAt: 1, _id: 1 } as const

/**
 * Run a find→mutate→save mutation, retrying on a Mongoose `VersionError`. Both
 * `info` and `ops` are Mixed, so a `save()` rewrites the whole branch — two
 * concurrent writers who each loaded the same snapshot would otherwise have the
 * later save silently clobber the earlier one. With `optimisticConcurrency` the
 * stale save throws `VersionError`; re-running reloads the fresh doc and
 * re-applies the change, so concurrent writes compose.
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

/** Largest numeric suffix among ids shaped `${prefix}<n>` (0 when none match). */
function maxSeq(ids: string[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  return ids.reduce((max, id) => {
    const m = re.exec(id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

// ── Reservation-time helpers (pure) ──────────────────────────────────────────

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

/**
 * True when a proposed slot on `courtId`/`dayKey` overlaps a live reservation.
 * Cancelled/no-show reservations free their slot; `excludeId` skips a reservation
 * being moved. Shared by walk-in creation and reschedule.
 */
function overlapsReservation(
  reservations: Reservation[],
  courtId: string,
  dayKey: string,
  start: string,
  durationMin: number,
  excludeId?: string
): boolean {
  return reservations.some((reservation) => {
    if (excludeId && reservation.id === excludeId) return false
    if ((reservation.courtId ?? "") !== courtId) return false
    if (reservationDayKey(reservation) !== dayKey) return false
    if (reservation.status === "cancelled" || reservation.status === "no-show")
      return false
    const rStart = reservationStart(reservation)
    if (!rStart) return false
    return rangesOverlap(
      start,
      durationMin,
      rStart,
      reservationDuration(reservation)
    )
  })
}

/** Reject a slot whose duration isn't a 15-min multiple or spills past hours. */
function assertWithinHours(
  venue: VenueInfo,
  start: string,
  durationMin: number
): void {
  const startMin = toMinutes(start)
  const endMin = startMin + durationMin
  if (durationMin < 15 || durationMin % 15 !== 0) {
    throw new BadRequestException("Duration must be in 15-minute steps")
  }
  if (
    startMin < toMinutes(venue.openFrom) ||
    endMin > toMinutes(venue.openTo)
  ) {
    throw new BadRequestException(
      "Reservation must stay within venue opening hours"
    )
  }
}

// MongoDB-backed venue service. Each operator venue is one document holding the
// whole VenueRecord ({ info, ops }); the collection is seeded from the hardcoded
// `INITIAL_VENUES` the first time it's read (idempotent), so every mutation below
// persists across restarts.
@Injectable()
export class VenuesService {
  constructor(
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>
  ) {}

  // Memoize the one-time seed so concurrent first-requests don't each insert the
  // demo venues (which would collide on the unique `venueId` index).
  private readonly ensureSeeded = once(async () => {
    if ((await this.venueModel.countDocuments()) > 0) return
    try {
      await this.venueModel.insertMany(
        INITIAL_VENUES.map((rec) => ({
          venueId: rec.info.id,
          info: rec.info,
          ops: rec.ops,
        })),
        { ordered: false }
      )
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
  })

  /** The hydrated document for a venue id (for mutation), or null. */
  private findDoc(id: string) {
    return this.venueModel.findOne({ venueId: id })
  }

  /** All records as plain VenueRecords, in venue order. */
  private async loadRecords(): Promise<VenueRecord[]> {
    const docs = await this.venueModel.find().sort(ORDER).lean<VenueDocument[]>()
    return docs.map((d) => ({ info: d.info, ops: d.ops }))
  }

  private async firstRecord(): Promise<VenueRecord> {
    const doc = await this.venueModel
      .findOne()
      .sort(ORDER)
      .lean<VenueDocument>()
    // The store is always seeded before this runs, so a venue always exists.
    return { info: doc!.info, ops: doc!.ops }
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Every venue's profile (no operator bundle) — for the switcher and manager. */
  async listVenues(): Promise<VenueInfo[]> {
    await this.ensureSeeded()
    return (await this.loadRecords()).map((r) => r.info)
  }

  /** The active venue's full operator bundle (the seed's `venue` payload). */
  async activeBundle(id?: string): Promise<VenueSeed> {
    await this.ensureSeeded()
    const doc = id ? await this.findDoc(id).lean<VenueDocument>() : null
    const rec = doc
      ? { info: doc.info, ops: doc.ops }
      : await this.firstRecord()
    return { info: rec.info, ...rec.ops }
  }

  /**
   * A specific venue's full operator bundle. Unlike `activeBundle`, this never
   * falls back to the first venue — a stale/typo'd id throws NotFound (→ 404).
   */
  async venueBundle(id: string): Promise<VenueSeed> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return { info: doc.info, ...doc.ops }
  }

  async getVenue(id: string): Promise<VenueInfo> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return doc.info
  }

  // ── Venue mutations ──────────────────────────────────────────────────────────

  async createVenue(input: VenueInput): Promise<VenueInfo> {
    await this.ensureSeeded()
    // Two concurrent creates can compute the same `v<n>` id; the unique index
    // rejects the loser. Recompute and retry a few times rather than 500.
    for (let attempt = 1; ; attempt++) {
      const ids = await this.venueModel.distinct("venueId")
      const info: VenueInfo = {
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
        await this.venueModel.create({
          venueId: info.id,
          info,
          ops: emptyOps([]),
        })
        return info
      } catch (err) {
        if (isDuplicateKeyError(err) && attempt < 5) continue
        throw err
      }
    }
  }

  async updateVenue(
    id: string,
    patch: Partial<VenueInput>
  ): Promise<VenueInfo> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(id)
      if (!doc) throw new NotFoundException("Venue not found")
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

  async removeVenue(id: string): Promise<void> {
    await this.ensureSeeded()
    if (!(await this.venueModel.exists({ venueId: id })))
      throw new NotFoundException("Venue not found")
    // Never delete the operator's only venue — the workspace needs a fallback.
    if ((await this.venueModel.countDocuments()) <= 1)
      throw new BadRequestException("Cannot delete the only venue")
    await this.venueModel.deleteOne({ venueId: id })
  }

  // ── Court mutations (scoped to a venue) ──────────────────────────────────────

  async addCourt(venueId: string, input: CourtInput): Promise<VenueCourt> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      // Persisted high-water counter, seeded from the current max, so a court id
      // is never reused after a deletion (which could re-link an orphaned
      // reservation to a different, newly-added court).
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

  async updateCourt(
    venueId: string,
    courtId: string,
    patch: Partial<CourtInput>
  ): Promise<VenueCourt> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      const court = doc?.ops.courts.find((c) => c.id === courtId)
      if (!doc || !court) throw new NotFoundException("Court not found")
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

  async removeCourt(venueId: string, courtId: string): Promise<void> {
    await this.ensureSeeded()
    await withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Court not found")
      const before = doc.ops.courts.length
      doc.ops.courts = doc.ops.courts.filter((c) => c.id !== courtId)
      if (doc.ops.courts.length === before)
        throw new NotFoundException("Court not found")
      doc.markModified("ops")
      await doc.save()
    })
  }

  async addWalkInReservation(
    venueId: string,
    input: WalkInReservationInput
  ): Promise<Reservation> {
    await this.ensureSeeded()
    // The whole find→validate→conflict-check→save runs inside the retry: on a
    // version conflict we reload and re-run the overlap guard against the fresh
    // reservation list, so two concurrent walk-ins can't both pass and double-book.
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Court or venue not found")

      const court = doc.ops.courts.find((item) => item.id === input.courtId)
      if (!court) throw new NotFoundException("Court or venue not found")
      if (court.state === "maintenance") {
        throw new BadRequestException("Court is under maintenance")
      }

      assertWithinHours(doc.info, input.start, input.durationMin)

      const conflict = overlapsReservation(
        doc.ops.reservations,
        input.courtId,
        input.dayKey,
        input.start,
        input.durationMin
      )
      if (conflict) {
        throw new ConflictException(
          "Selected time overlaps an existing reservation"
        )
      }

      const day = VENUE_DAYS.find((item) => item.key === input.dayKey)
        ?.label ?? { en: input.dayKey, vi: input.dayKey }
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

  /**
   * Set a reservation's status (approve/decline, check-in, cancel). One fn backs
   * every status transition; the caller maps its intent to a concrete status.
   */
  async updateReservationStatus(
    venueId: string,
    reservationId: string,
    status: ReservationStatus
  ): Promise<Reservation> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      const reservation = doc?.ops.reservations.find(
        (r) => r.id === reservationId
      )
      if (!doc || !reservation)
        throw new NotFoundException("Reservation not found")
      reservation.status = status
      doc.markModified("ops")
      await doc.save()
      return reservation
    })
  }

  /**
   * Move a reservation to a new day/time on its own court, re-running the same
   * opening-hours + overlap guards as a walk-in (excluding the reservation
   * itself) and re-deriving its `time`, `day` and price.
   */
  async rescheduleReservation(
    venueId: string,
    reservationId: string,
    input: RescheduleReservationInput
  ): Promise<Reservation> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      const reservation = doc?.ops.reservations.find(
        (r) => r.id === reservationId
      )
      if (!doc || !reservation)
        throw new NotFoundException("Reservation not found")

      assertWithinHours(doc.info, input.start, input.durationMin)
      const courtId = reservation.courtId ?? ""
      if (
        overlapsReservation(
          doc.ops.reservations,
          courtId,
          input.dayKey,
          input.start,
          input.durationMin,
          reservationId
        )
      ) {
        throw new ConflictException(
          "Selected time overlaps an existing reservation"
        )
      }

      const day = VENUE_DAYS.find((item) => item.key === input.dayKey)
        ?.label ?? { en: input.dayKey, vi: input.dayKey }
      reservation.dayKey = input.dayKey
      reservation.day = day
      reservation.start = input.start
      reservation.durationMin = input.durationMin
      reservation.time = slotRange(input.start, input.durationMin)
      // Duration changed, so re-price against the court's rate when we can
      // resolve it (legacy seed reservations may carry no courtId — keep price).
      const court = doc.ops.courts.find((c) => c.id === courtId)
      if (court)
        reservation.price = priceFor(court.pricePerHour, input.durationMin)

      doc.markModified("ops")
      await doc.save()
      return reservation
    })
  }

  // ── Customer mutations (scoped to a venue) ───────────────────────────────────

  /**
   * Add a CRM customer to a venue. The phone number is the customer id, so a
   * duplicate phone is a Conflict; stats start zeroed and the tier is "new".
   */
  async addCustomer(
    venueId: string,
    input: CustomerInput
  ): Promise<VenueCustomer> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      const id = input.phone.trim()
      if (doc.ops.customers.some((c) => c.id === id)) {
        throw new ConflictException(
          "A customer with this phone already exists"
        )
      }
      const customer: VenueCustomer = {
        id,
        name: input.name.trim(),
        initials: initialsOf(input.name),
        favoriteSport: input.favoriteSport,
        visits: 0,
        lastVisit: { en: "Never", vi: "Chưa từng" },
        ltv: 0,
        noShowRate: 0,
        tier: "new",
        trend: 0,
      }
      doc.ops.customers.push(customer)
      doc.markModified("ops")
      await doc.save()
      return customer
    })
  }
}
