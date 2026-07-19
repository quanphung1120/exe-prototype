import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  addMinutes,
  canTransitionReservation,
  combineDateTime,
  computeVenueStats,
  dayLabelFor,
  diffMinutes,
  initialsOf,
  isoDateOf,
  priceFor,
  rangesOverlap,
  slotRange,
  toMinutes,
  venueCourtToCourt,
  vnNowIso,
  type Court,
  type NotificationItem,
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
import { ProfileService } from "../players/profile.service.js"
import { SessionsService } from "../sessions/sessions.service.js"
import { Venue, type VenueDocument } from "./venue.schema.js"

/**
 * The session cross-write surface Venues depends on. Typing the injected param
 * as this interface (not the concrete SessionsService) keeps the ESM Sessions↔
 * Venues import cycle from crashing at load: `emitDecoratorMetadata` would
 * otherwise bake SessionsService into `design:paramtypes` and evaluate it before
 * it initializes. The `@Inject(forwardRef(...))` token drives the real injection.
 */
interface SessionSyncPort {
  applyReservationStatus(
    userId: string,
    sessionId: string,
    patch: { status: ReservationStatus; reason?: string }
  ): Promise<void>
}

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
  /** Clerk account provisioning this venue (setup wizard) — enforces one-per-account. */
  ownerId?: string
}

/** A setup-wizard payload: the venue profile plus its initial courts. */
export interface VenueSetupInput extends VenueInput {
  courts: CourtInput[]
}

/** An app booking cross-writing into the owning venue as a pending reservation. */
export interface AppReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  userId: string
  sessionId: string
  customerName: string
  /** Set on re-writes so the same booking updates its reservation in place. */
  reservationId?: string
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
  return reservation.dayKey ?? ""
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
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>,
    // Cross-surface sync: an operator decision updates the linked player session
    // and pushes a notification. forwardRef breaks the Sessions ↔ Venues cycle;
    // the param is typed as the SessionSyncPort interface (not SessionsService)
    // so no class leaks into the eager decorator metadata (see SessionSyncPort).
    @Inject(forwardRef(() => SessionsService))
    private readonly sessions: SessionSyncPort,
    private readonly profiles: ProfileService
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
    return this.withComputedStats({ info: rec.info, ...rec.ops })
  }

  /**
   * A specific venue's full operator bundle. Unlike `activeBundle`, this never
   * falls back to the first venue — a stale/typo'd id throws NotFound (→ 404).
   */
  async venueBundle(id: string): Promise<VenueSeed> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return this.withComputedStats({ info: doc.info, ...doc.ops })
  }

  /**
   * Override the four hybrid KPIs (revenue/utilization/no-show/new-customers)
   * with values computed from the venue's real reservations before serving,
   * leaving every other stat/series at its seeded value (see computeVenueStats).
   */
  private withComputedStats(bundle: VenueSeed): VenueSeed {
    return {
      ...bundle,
      stats: computeVenueStats(
        bundle.info,
        bundle.courts,
        bundle.reservations,
        bundle.stats,
        isoDateOf(vnNowIso())
      ),
    }
  }

  async getVenue(id: string): Promise<VenueInfo> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return doc.info
  }

  // ── Owner-scoped reads (one venue per account) ───────────────────────────────

  /** The venueId this account owns, or null when it hasn't provisioned one yet. */
  async myVenueId(userId: string): Promise<string | null> {
    await this.ensureSeeded()
    const doc = await this.venueModel
      .findOne({ ownerId: userId })
      .select("venueId")
      .lean<VenueDocument>()
    return doc?.venueId ?? null
  }

  /** The caller's own venue profile; throws NotFound → the web shows setup. */
  async myVenueInfo(userId: string): Promise<VenueInfo> {
    const id = await this.myVenueId(userId)
    if (!id) throw new NotFoundException("No venue for this account")
    return this.getVenue(id)
  }

  /** The caller's own operator bundle; throws NotFound → the web shows setup. */
  async myBundle(userId: string): Promise<VenueSeed> {
    const id = await this.myVenueId(userId)
    if (!id) throw new NotFoundException("No venue for this account")
    return this.venueBundle(id)
  }

  /** The venueId whose court catalog holds `courtId` (for the booking cross-write). */
  async findVenueByCourtId(courtId: string): Promise<string | null> {
    await this.ensureSeeded()
    const doc = await this.venueModel
      .findOne({ "ops.courts.id": courtId })
      .select("venueId")
      .lean<VenueDocument>()
    return doc?.venueId ?? null
  }

  // ── Unified court catalog (every venue's courts as discovery courts) ──────────

  /**
   * The shared discovery catalog: every venue's `VenueCourt`s projected to the
   * `Court` shape the player finder/map read. One source of truth — retiring the
   * separate hardcoded catalog — so a booked court (`vc*`) resolves straight back
   * to its owning venue for the reservation cross-write.
   */
  async catalogCourts(sport?: SportKey): Promise<Court[]> {
    await this.ensureSeeded()
    const records = await this.loadRecords()
    const courts = records.flatMap((rec) =>
      rec.ops.courts.map((court) => venueCourtToCourt(rec.info, court))
    )
    return sport ? courts.filter((c) => c.sports.includes(sport)) : courts
  }

  /** One catalog court by its `vc*` id; throws NotFound (→ 404) when unknown. */
  async catalogCourt(id: string): Promise<Court> {
    const found = (await this.catalogCourts()).find((c) => c.id === id)
    if (!found) throw new NotFoundException("Court not found")
    return found
  }

  // ── Venue mutations ──────────────────────────────────────────────────────────

  async createVenue(input: VenueInput): Promise<VenueInfo> {
    await this.ensureSeeded()
    if (toMinutes(input.openFrom) >= toMinutes(input.openTo)) {
      throw new BadRequestException("openFrom must be before openTo")
    }
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
          ownerId: input.ownerId,
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
      if (toMinutes(next.openFrom) >= toMinutes(next.openTo)) {
        throw new BadRequestException("openFrom must be before openTo")
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

  /**
   * Provision the account's single venue from the setup wizard: create the venue
   * (owned by `userId`, enforced one-per-account), add each court, and seed the
   * account's player profile so it has a bookable identity from day one.
   */
  async provisionVenue(
    userId: string,
    input: VenueSetupInput
  ): Promise<VenueSeed> {
    await this.ensureSeeded()
    if (await this.myVenueId(userId)) {
      throw new ConflictException("This account already has a venue")
    }
    const info = await this.createVenue({ ...input, ownerId: userId })
    for (const court of input.courts) {
      await this.addCourt(info.id, court)
    }
    await this.profiles.getProfile(userId)
    return this.venueBundle(info.id)
  }

  // ── Court mutations (scoped to a venue) ──────────────────────────────────────

  async addCourt(venueId: string, input: CourtInput): Promise<VenueCourt> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      if (!doc.info.sports.includes(input.sport)) {
        throw new BadRequestException(
          `Venue does not offer sport "${input.sport}"`
        )
      }
      if (
        doc.ops.courts.some(
          (c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase()
        )
      ) {
        throw new ConflictException(
          `Court name "${input.name}" already exists in this venue`
        )
      }
      // Court ids are namespaced by venue (`${venueId}c<n>`, matching the seed's
      // v2c*/v3c* convention) so they're GLOBALLY unique — the unified discovery
      // catalog keys on this id, and a plain `vc<n>` would collide across venues
      // (e.g. two venues' "court 1"), resolving a booking to the wrong venue.
      // Persisted high-water counter, seeded from the current max, so a court id
      // is never reused after a deletion (which could re-link an orphaned
      // reservation to a different, newly-added court).
      const prefix = `${venueId}c`
      const seq =
        Math.max(
          doc.courtSeq ?? 0,
          maxSeq(doc.ops.courts.map((c) => c.id), prefix)
        ) + 1
      doc.courtSeq = seq
      const court: VenueCourt = {
        id: `${prefix}${seq}`,
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
      if (patch.name !== undefined) {
        if (
          doc.ops.courts.some(
            (c) =>
              c.id !== courtId &&
              c.name.trim().toLowerCase() === patch.name!.trim().toLowerCase()
          )
        ) {
          throw new ConflictException(
            `Court name "${patch.name}" already exists in this venue`
          )
        }
        court.name = patch.name
      }
      if (patch.sport !== undefined) {
        if (!doc.info.sports.includes(patch.sport)) {
          throw new BadRequestException(
            `Venue does not offer sport "${patch.sport}"`
          )
        }
        court.sport = patch.sport
      }
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

      const todayIso = isoDateOf(vnNowIso())
      const day = dayLabelFor(input.dayKey, todayIso)
      const startAt = combineDateTime(input.dayKey, input.start)
      const endAt = combineDateTime(
        input.dayKey,
        addMinutes(input.start, input.durationMin)
      )
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
        startAt,
        endAt,
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
   * Create (or, on a re-write, update in place) the venue reservation that mirrors
   * a player's app booking — the single shared record the operator then approves,
   * declines or checks in. Keyed by `reservationId` for idempotency: the web
   * re-PUTs the whole session on every edit, so a set id updates the existing row
   * (without downgrading an operator's status decision) rather than duplicating.
   * Also links the booker into the venue CRM. Runs inside the version-retry so a
   * concurrent walk-in can't slip past the overlap guard and double-book.
   */
  async createOrSyncAppReservation(
    venueId: string,
    input: AppReservationInput
  ): Promise<Reservation> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      const court = doc.ops.courts.find((c) => c.id === input.courtId)
      if (!court) throw new NotFoundException("Court not found")

      assertWithinHours(doc.info, input.start, input.durationMin)

      const existing = input.reservationId
        ? doc.ops.reservations.find((r) => r.id === input.reservationId)
        : undefined

      if (
        overlapsReservation(
          doc.ops.reservations,
          input.courtId,
          input.dayKey,
          input.start,
          input.durationMin,
          existing?.id
        )
      ) {
        throw new ConflictException(
          "Selected time overlaps an existing reservation"
        )
      }

      const todayIso = isoDateOf(vnNowIso())
      const day = dayLabelFor(input.dayKey, todayIso)
      const startAt = combineDateTime(input.dayKey, input.start)
      const endAt = combineDateTime(
        input.dayKey,
        addMinutes(input.start, input.durationMin)
      )
      const price = priceFor(court.pricePerHour, input.durationMin)
      const party = court.sport === "pickleball" ? 4 : 2

      let reservation: Reservation
      if (existing) {
        // Re-write of the same booking: refresh slot/court but keep the
        // operator's status decision (don't reset an approved booking to pending).
        existing.sport = court.sport
        existing.courtId = court.id
        existing.court = court.name
        existing.dayKey = input.dayKey
        existing.day = day
        existing.start = input.start
        existing.durationMin = input.durationMin
        existing.startAt = startAt
        existing.endAt = endAt
        existing.time = slotRange(input.start, input.durationMin)
        existing.party = party
        existing.price = price
        reservation = existing
      } else {
        const seq =
          Math.max(
            doc.reservationSeq ?? 0,
            maxSeq(
              doc.ops.reservations.map((r) => r.id),
              "rv"
            )
          ) + 1
        doc.reservationSeq = seq
        reservation = {
          id: `rv${seq}`,
          customer: {
            name: input.customerName.trim(),
            initials: initialsOf(input.customerName),
          },
          userId: input.userId,
          sessionId: input.sessionId,
          sport: court.sport,
          courtId: court.id,
          court: court.name,
          dayKey: input.dayKey,
          day,
          start: input.start,
          durationMin: input.durationMin,
          startAt,
          endAt,
          time: slotRange(input.start, input.durationMin),
          party,
          source: "app",
          status: "pending",
          price,
          noShowRisk: 10,
          isRegular: false,
        }
        doc.ops.reservations.push(reservation)
      }

      this.upsertAppCustomer(doc, input.userId, input.customerName, court.sport)
      doc.markModified("ops")
      await doc.save()
      return reservation
    })
  }

  /** Add the app booker to the venue CRM once (linked by account), if new. */
  private upsertAppCustomer(
    doc: VenueDocument,
    userId: string,
    name: string,
    sport: SportKey
  ): void {
    if (doc.ops.customers.some((c) => c.id === userId || c.userId === userId))
      return
    const customer: VenueCustomer = {
      id: userId,
      userId,
      name: name.trim(),
      initials: initialsOf(name),
      favoriteSport: sport,
      visits: 0,
      lastVisit: { en: "Today", vi: "Hôm nay" },
      ltv: 0,
      noShowRate: 0,
      tier: "new",
      trend: 0,
    }
    doc.ops.customers.push(customer)
  }

  /**
   * Set a reservation's status (approve/decline, check-in, cancel). One fn backs
   * every status transition; the caller maps its intent to a concrete status.
   * For app bookings it also reconciles the linked player session and, on
   * approve/decline, notifies the player (a decline stores the reason).
   */
  async updateReservationStatus(
    venueId: string,
    reservationId: string,
    status: ReservationStatus,
    reason?: string
  ): Promise<Reservation> {
    await this.ensureSeeded()
    // Tracks the pre-transition status so the caller can tell a no-op PUT
    // (same status, e.g. a retried request) from a real transition and skip
    // reconciliation/notification for the former.
    let prevStatus: ReservationStatus | null = null
    const reservation = await withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      const r = doc?.ops.reservations.find((item) => item.id === reservationId)
      if (!doc || !r) throw new NotFoundException("Reservation not found")
      if (r.status === status) return r
      if (!canTransitionReservation(r.status, status)) {
        throw new ConflictException(
          `Không thể chuyển đặt sân từ "${r.status}" sang "${status}"`
        )
      }
      prevStatus = r.status
      r.status = status
      if (status === "cancelled" && reason) r.declineReason = reason
      doc.markModified("ops")
      await doc.save()
      return r
    })

    // Cross-surface reconciliation: an app booking carries the linked player;
    // walk-ins have no session/user and skip cleanly.
    if (prevStatus && reservation.userId && reservation.sessionId) {
      await this.sessions.applyReservationStatus(
        reservation.userId,
        reservation.sessionId,
        { status, reason }
      )
      const notify = this.decisionNotification(
        reservationId,
        prevStatus,
        status,
        reason
      )
      if (notify) await this.profiles.addNotification(reservation.userId, notify)
    }
    return reservation
  }

  /** The player notification for an operator decision, or null when silent. */
  private decisionNotification(
    reservationId: string,
    prevStatus: ReservationStatus,
    status: ReservationStatus,
    reason?: string
  ): NotificationItem | null {
    const base = { time: "Vừa xong", read: false, href: "/dashboard/bookings" }
    if (status === "cancelled" && prevStatus === "pending" && reason) {
      return {
        id: `booking-declined-${reservationId}`,
        kind: "booking",
        text: `Chủ sân đã từ chối đặt sân: ${reason}. Đã hoàn tiền (mô phỏng).`,
        ...base,
      }
    }
    if (status === "cancelled" && reason) {
      return {
        id: `booking-cancelled-${reservationId}`,
        kind: "booking",
        text: `Chủ sân đã huỷ đặt sân đã duyệt của bạn: ${reason}. Đã hoàn tiền (mô phỏng).`,
        ...base,
      }
    }
    if (status === "confirmed") {
      return {
        id: `booking-approved-${reservationId}`,
        kind: "booking",
        text: "Chủ sân đã duyệt đặt sân của bạn.",
        ...base,
      }
    }
    if (status === "no-show") {
      return {
        id: `booking-no-show-${reservationId}`,
        kind: "booking",
        text: "Bạn đã được đánh dấu vắng mặt (no-show) cho lượt đặt sân này.",
        ...base,
      }
    }
    return null
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

      const todayIso = isoDateOf(vnNowIso())
      reservation.dayKey = input.dayKey
      reservation.day = dayLabelFor(input.dayKey, todayIso)
      reservation.start = input.start
      reservation.durationMin = input.durationMin
      reservation.startAt = combineDateTime(input.dayKey, input.start)
      reservation.endAt = combineDateTime(
        input.dayKey,
        addMinutes(input.start, input.durationMin)
      )
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
