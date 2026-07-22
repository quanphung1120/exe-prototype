import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  computeChannelMix,
  computeCustomerStats,
  computePeakHours,
  computeRevenueSeries,
  computeSportMix,
  computeVenueStats,
  initialsOf,
  isoDateOf,
  toMinutes,
  venueCourtToCourt,
  vnNowIso,
  type BookingRecordStatus,
  type Court,
  type CourtBlock,
  type CourtBlockReason,
  type Reservation,
  type ReservationStatus,
  type Brand,
  type SportKey,
  type Venue as VenueInfo,
  type VenueCourt,
  type VenueCustomer,
  type VenueSeed,
} from "../../shared/index.js"

import { emptyOps, INITIAL_VENUES, type VenueRecord } from "../../data/venue.js"
import {
  isDuplicateKeyError,
  isDuplicateKeyErrorOn,
  once,
  withVersionRetry,
} from "../../common/mongo-util.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { ProfileService } from "../players/profile.service.js"
import {
  assertWithinHours,
  decisionNotification,
} from "../bookings/booking.helpers.js"
import {
  BookingsService,
  type RescheduleReservationInput,
  type WalkInReservationInput,
} from "../bookings/bookings.service.js"
import { roomChannelId, StreamService } from "../stream/stream.service.js"
import { BrandsService } from "../brands/brands.service.js"
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
  /** Clerk account provisioning this venue (setup wizard) — denormalized brand owner. */
  ownerId?: string
  /** The {@link Brand} this venue is a branch of (set by `provisionVenue`). */
  brandId?: string
  /** Update-only: archive (decision #11) or `false` to restore. Never set at creation. */
  archived?: boolean
}

/** A setup-wizard payload: the venue profile plus its initial courts. */
export interface VenueSetupInput extends VenueInput {
  courts: CourtInput[]
}

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
  /** Update-only: archive (decision #11) or `false` to restore. Never set at creation. */
  archived?: boolean
}

export interface CustomerInput {
  name: string
  phone: string
  favoriteSport: SportKey
}

export interface CourtBlockInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  reason: CourtBlockReason
  note?: string
}

// Insertion order = venue order (the first venue is the default). Sorting by
// createdAt/_id ascending recovers seed order and keeps new venues last.
const ORDER = { createdAt: 1, _id: 1 } as const

/**
 * Narrow a booking status to the notification helper's domain — null for the
 * two payment-gate states (`awaiting_payment`/`expired`) a future phase
 * introduces, which this venue-scoped decision endpoint never produces today.
 */
function asReservationStatus(
  status: BookingRecordStatus
): Exclude<ReservationStatus, "held"> | null {
  return status === "awaiting_payment" || status === "expired" ? null : status
}

/** Largest numeric suffix among ids shaped `${prefix}<n>` (0 when none match). */
function maxSeq(ids: string[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  return ids.reduce((max, id) => {
    const m = re.exec(id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

// MongoDB-backed venue service. Each operator venue is one document holding the
// whole VenueRecord ({ info, ops }); the collection is seeded from the hardcoded
// `INITIAL_VENUES` the first time it's read (idempotent), so every mutation below
// persists across restarts.
//
// Court/customer CRUD lives here; booking/reservation logic lives in
// BookingsService (the canonical `bookings` collection) — this service composes
// its projection into the venue bundle on read and delegates every reservation
// mutation to it. Depending on BookingsService (not the other way) is what
// keeps this module out of the old Sessions↔Venues forwardRef cycle.
@Injectable()
export class VenuesService {
  private readonly logger = new Logger(VenuesService.name)

  constructor(
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>,
    // Explicit tokens (not just the TS type) since esbuild-based runners like
    // tsx don't emit the design:paramtypes metadata Nest's implicit
    // constructor-injection would otherwise rely on.
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    // Operator decline/cancel best-effort freezes the linked room's chat
    // (quyết định #13) — see updateReservationStatus.
    @Inject(StreamService) private readonly stream: StreamService,
    // Provisioning a venue ensures the account's brand (its branches' parent).
    @Inject(BrandsService) private readonly brands: BrandsService
  ) {}

  // Memoize the one-time seed so concurrent first-requests don't each insert the
  // demo venues (which would collide on the unique `venueId` index).
  private readonly ensureSeeded = once(async () => {
    // Reconcile the collection's indexes with the current schema before anything
    // reads/writes by owner. This venue used to carry a UNIQUE index on `ownerId`
    // (one venue per account); that constraint moved to `Brand.ownerId`, and a
    // venue's `ownerId` is now a plain non-unique index (a brand owns many
    // branches). Deleting the `unique` index line from the schema does NOT drop
    // the index already built on an existing database, so without this a second
    // branch's insert would still collide on the stale unique index. `syncIndexes`
    // drops indexes no longer in the schema and builds the current set; swallow
    // failures (e.g. missing privileges) so a read never 500s over indexing.
    try {
      await this.venueModel.syncIndexes()
    } catch (err) {
      this.logger.warn(`Venue index sync skipped: ${String(err)}`)
    }

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
    const docs = await this.venueModel
      .find()
      .sort(ORDER)
      .lean<VenueDocument[]>()
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

  /**
   * The operator bundle for one venue record, with `reservations` overridden by
   * the live projection from BookingsService — the venue doc's own `ops.reservations`
   * is stale/legacy and never read here (see BookingsService#listForVenue).
   */
  private async composeBundle(rec: VenueRecord): Promise<VenueSeed> {
    const [reservations, refundQueue] = await Promise.all([
      this.bookings.listForVenue(rec.info.id),
      this.bookings.listRefundQueue(rec.info.id),
    ])
    // `ops.blocks` postdates some persisted venue docs — default it here, the
    // one place a stored `VenueRecord` becomes the served `VenueSeed`, so every
    // caller downstream can assume the array exists (VienTD-Review decision #12).
    return {
      info: rec.info,
      ...rec.ops,
      blocks: rec.ops.blocks ?? [],
      reservations,
      refundQueue,
    }
  }

  /** The active venue's full operator bundle (the seed's `venue` payload). */
  async activeBundle(id?: string): Promise<VenueSeed> {
    await this.ensureSeeded()
    const doc = id ? await this.findDoc(id).lean<VenueDocument>() : null
    const rec = doc
      ? { info: doc.info, ops: doc.ops }
      : await this.firstRecord()
    return this.withComputedStats(await this.composeBundle(rec))
  }

  /**
   * A specific venue's full operator bundle. Unlike `activeBundle`, this never
   * falls back to the first venue — a stale/typo'd id throws NotFound (→ 404).
   */
  async venueBundle(id: string): Promise<VenueSeed> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return this.withComputedStats(
      await this.composeBundle({ info: doc.info, ops: doc.ops })
    )
  }

  /**
   * Override the four hybrid KPIs (revenue/utilization/no-show/new-customers)
   * with values computed from the venue's real reservations before serving,
   * leaving every other stat/series at its seeded value (see computeVenueStats).
   *
   * For a venue with a real operator (`info.ownerId` set) this goes further and
   * recomputes the chart series themselves — revenue/sport-mix/channel-mix/peak
   * hours — from that venue's own reservations, so the analytics view is
   * honest for a real business. Demo venues (no owner) keep their curated,
   * hardcoded series; AI insights are never computed either way — they stay
   * seeded, and the web marks them with a fixed "Demo AI" chip.
   *
   * Also re-derives each CRM customer's visits/ltv/noShowRate/tier from the
   * same reservations (`computeCustomerStats`, decision #15/default) — pure,
   * read-time-only, so a walk-in/app-booking CRM row created at zeroed stats
   * is always consistent without a completion-time write hook.
   */
  private withComputedStats(bundle: VenueSeed): VenueSeed {
    const todayIso = isoDateOf(vnNowIso())
    const stats = computeVenueStats(
      bundle.info,
      bundle.courts,
      bundle.reservations,
      bundle.stats,
      todayIso
    )
    if (!bundle.info.ownerId) return { ...bundle, stats }
    return {
      ...bundle,
      stats,
      revenueSeries: computeRevenueSeries(bundle.reservations, todayIso),
      sportMix: computeSportMix(bundle.reservations),
      channelMix: computeChannelMix(bundle.reservations),
      peakHours: computePeakHours(bundle.courts, bundle.reservations),
      customers: computeCustomerStats(bundle.customers, bundle.reservations),
    }
  }

  async getVenue(id: string): Promise<VenueInfo> {
    await this.ensureSeeded()
    const doc = await this.findDoc(id).lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    return doc.info
  }

  // ── Owner-scoped reads (an account's brand may own many branches) ────────────

  /**
   * The account's default (first) branch id, or null when it has provisioned
   * none. Insertion order = branch order, so this is the account's flagship.
   */
  async myVenueId(userId: string): Promise<string | null> {
    await this.ensureSeeded()
    const doc = await this.venueModel
      .findOne({ ownerId: userId })
      .sort(ORDER)
      .select("venueId")
      .lean<VenueDocument>()
    return doc?.venueId ?? null
  }

  /** Every branch this account owns (profiles only) — for the switcher/manager. */
  async myBranches(userId: string): Promise<VenueInfo[]> {
    await this.ensureSeeded()
    const docs = await this.venueModel
      .find({ ownerId: userId })
      .sort(ORDER)
      .lean<VenueDocument[]>()
    return docs.map((d) => d.info)
  }

  /** The account's brand plus its branches — the operator workspace header. */
  async myWorkspace(
    userId: string
  ): Promise<{ brand: Brand | null; venues: VenueInfo[] }> {
    const [brand, venues] = await Promise.all([
      this.brands.myBrand(userId),
      this.myBranches(userId),
    ])
    return { brand, venues }
  }

  /**
   * Assert `userId` owns `venueId` (a branch of their brand): 404 when the
   * venue is unknown, 403 when it belongs to another account. The guard behind
   * every branch-scoped read/mutation now that the path carries the venue id.
   */
  async assertOwnsVenue(userId: string, venueId: string): Promise<void> {
    await this.ensureSeeded()
    const doc = await this.venueModel
      .findOne({ venueId })
      .select("ownerId")
      .lean<VenueDocument>()
    if (!doc) throw new NotFoundException("Venue not found")
    if (doc.ownerId !== userId) {
      throw new ForbiddenException("You do not manage this venue")
    }
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

  // ── Unified court catalog (every venue's courts as discovery courts) ──────────

  /**
   * The shared discovery catalog: every venue's `VenueCourt`s projected to the
   * `Court` shape the player finder/map read. One source of truth — retiring the
   * separate hardcoded catalog — so a booked court (`vc*`) resolves straight back
   * to its owning venue for the reservation cross-write. Archived venues/courts
   * (decision #11) are excluded — they're retired from discovery/new bookings,
   * but `findVenueByCourtId` (`BookingsService`) deliberately does NOT filter,
   * so an existing booking still resolves back to its venue.
   */
  async catalogCourts(sport?: SportKey): Promise<Court[]> {
    await this.ensureSeeded()
    const records = await this.loadRecords()
    const courts = records
      .filter((rec) => !rec.info.archived)
      .flatMap((rec) =>
        rec.ops.courts
          .filter((court) => !court.archived)
          .map((court) => venueCourtToCourt(rec.info, court))
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
    // Two concurrent creates can compute the same `v<n>` id; the unique `venueId`
    // index rejects the loser. Recompute and retry a few times rather than 500 —
    // but only for a `venueId` collision: a duplicate on any other index means a
    // constraint a fresh id can't satisfy, so surface it instead of looping.
    for (let attempt = 1; ; attempt++) {
      const ids = await this.venueModel.distinct("venueId")
      const info: VenueInfo = {
        id: `v${maxSeq(ids, "v") + 1}`,
        brandId: input.brandId,
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
        if (isDuplicateKeyErrorOn(err, "venueId") && attempt < 5) continue
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
      // Archiving through the general patch route (as opposed to `archiveVenue`,
      // which `DELETE /api/venues` calls) is guarded the same way — restoring
      // (`archived: false`) never is, since restoring can't conflict with a
      // live booking.
      if (patch.archived === true && !next.archived) {
        await this.guardNoFutureLiveBookings(id)
      }
      if (patch.archived !== undefined) next.archived = patch.archived
      doc.markModified("info")
      await doc.save()
      return doc.info
    })
  }

  /**
   * Throw a Conflict when `venueId` (optionally one `courtId`) still has a
   * future pending/confirmed booking — the guard behind both archive routes
   * (decision #11: "chặn khi còn reservation pending/confirmed tương lai").
   */
  private async guardNoFutureLiveBookings(
    venueId: string,
    courtId?: string
  ): Promise<void> {
    if (await this.bookings.hasFutureLiveBookings(venueId, courtId)) {
      throw new ConflictException(
        "Còn lượt đặt sân đang chờ duyệt hoặc đã xác nhận trong tương lai — hãy huỷ và hoàn tiền trước khi lưu trữ."
      )
    }
  }

  /**
   * Archive (soft-delete) one branch — `DELETE /api/venues/:venueId` (decision
   * #11), replacing a hard delete. Guarded on a future pending/confirmed
   * booking anywhere in the venue; idempotent on an already-archived venue.
   * Restore via `updateVenue({ archived: false })`. An archived branch stays
   * under its brand and keeps appearing in the switcher — the manage UI offers
   * "Khôi phục", not a fresh setup.
   */
  async archiveVenue(id: string): Promise<void> {
    await this.ensureSeeded()
    await withVersionRetry(async () => {
      const doc = await this.findDoc(id)
      if (!doc) throw new NotFoundException("Venue not found")
      if (doc.info.archived) return
      await this.guardNoFutureLiveBookings(id)
      doc.info.archived = true
      doc.markModified("info")
      await doc.save()
    })
  }

  /**
   * Provision a venue branch from the setup wizard: ensure the account's brand
   * (created from this branch's profile on the first call, reused after), create
   * the venue under it (owned by `userId`, brand denormalized onto the venue),
   * add each court, and seed the account's player profile so it has a bookable
   * identity from day one. No longer one-per-account — an account's brand may
   * hold many branches.
   */
  async provisionVenue(
    userId: string,
    input: VenueSetupInput
  ): Promise<VenueSeed> {
    await this.ensureSeeded()
    const brand = await this.brands.ensureBrand(userId, {
      name: input.name,
      image: input.image,
      description: input.description,
    })
    const info = await this.createVenue({
      ...input,
      ownerId: userId,
      brandId: brand.id,
    })
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
          maxSeq(
            doc.ops.courts.map((c) => c.id),
            prefix
          )
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
      // Same archive guard as `removeCourt`/`archiveVenue` — restoring
      // (`archived: false`, decision #11's documented restore path) skips it.
      if (patch.archived === true && !court.archived) {
        await this.guardNoFutureLiveBookings(venueId, courtId)
      }
      if (patch.archived !== undefined) court.archived = patch.archived
      doc.markModified("ops")
      await doc.save()
      return court
    })
  }

  /**
   * Archive (soft-delete) a court — `DELETE /api/venues/courts/:courtId`
   * (decision #11), replacing a hard delete so a historical booking never
   * orphans. Guarded on a future pending/confirmed booking on this court;
   * idempotent when already archived. Restore via
   * `updateCourt(venueId, courtId, { archived: false })`.
   */
  async removeCourt(venueId: string, courtId: string): Promise<void> {
    await this.ensureSeeded()
    await withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      const court = doc?.ops.courts.find((c) => c.id === courtId)
      if (!doc || !court) throw new NotFoundException("Court not found")
      if (court.archived) return
      await this.guardNoFutureLiveBookings(venueId, courtId)
      court.archived = true
      doc.markModified("ops")
      await doc.save()
    })
  }

  // ── Court block mutations (scoped to a venue, decision #12) ──────────────────

  /**
   * Block a court/day/time window out from both booking paths — `POST
   * /api/venues/blocks`. Rejects an archived court and, per decision #12,
   * rejects overlapping a *live* booking (pending/confirmed/checked-in — see
   * `BookingsService#hasLiveBookingOverlap`); it never blocks on an already-
   * cancelled/completed/expired one. `blockSeq` mints `id` the same way
   * `courtSeq` mints a court's.
   */
  async addBlock(venueId: string, input: CourtBlockInput): Promise<CourtBlock> {
    await this.ensureSeeded()
    return withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      const court = doc.ops.courts.find((c) => c.id === input.courtId)
      if (!court) throw new NotFoundException("Court not found")
      if (court.archived) {
        throw new BadRequestException(
          "Không thể khoá khung giờ trên sân đã lưu trữ"
        )
      }
      assertWithinHours(doc.info, input.start, input.durationMin)
      if (
        await this.bookings.hasLiveBookingOverlap(
          venueId,
          input.courtId,
          input.dateKey,
          input.start,
          input.durationMin
        )
      ) {
        throw new ConflictException(
          "Khung giờ này đang có lượt đặt sân (chờ duyệt/đã xác nhận/đã check-in) — hãy xử lý trước khi khoá sân"
        )
      }
      const existing = doc.ops.blocks ?? []
      const seq =
        Math.max(
          doc.blockSeq ?? 0,
          maxSeq(
            existing.map((b) => b.id),
            `${venueId}b`
          )
        ) + 1
      doc.blockSeq = seq
      const block: CourtBlock = {
        id: `${venueId}b${seq}`,
        courtId: input.courtId,
        dateKey: input.dateKey,
        start: input.start,
        durationMin: input.durationMin,
        reason: input.reason,
        note: input.note,
      }
      doc.ops.blocks = [...existing, block]
      doc.markModified("ops")
      await doc.save()
      return block
    })
  }

  /** Lift a court block (open the slot back up) — `DELETE /api/venues/blocks/:blockId`. */
  async removeBlock(venueId: string, blockId: string): Promise<void> {
    await this.ensureSeeded()
    await withVersionRetry(async () => {
      const doc = await this.findDoc(venueId)
      if (!doc) throw new NotFoundException("Venue not found")
      const existing = doc.ops.blocks ?? []
      const next = existing.filter((b) => b.id !== blockId)
      if (next.length === existing.length)
        throw new NotFoundException("Block not found")
      doc.ops.blocks = next
      doc.markModified("ops")
      await doc.save()
    })
  }

  // ── Reservation mutations (delegated to BookingsService) ─────────────────────

  async addWalkInReservation(
    venueId: string,
    input: WalkInReservationInput
  ): Promise<Reservation> {
    await this.ensureSeeded()
    return this.bookings.createWalkIn(venueId, input)
  }

  /**
   * Set a reservation's status (approve/decline, check-in, cancel). The
   * transition guard + write lives in BookingsService; this wraps it with the
   * player notification a decision fires (walk-ins have no linked userId and
   * skip cleanly).
   */
  async updateReservationStatus(
    venueId: string,
    reservationId: string,
    // `held` is a projection-only status the operator never sends — the DTO
    // (`@IsIn(RESERVATION_STATUSES)`) restricts input to the six real operator
    // statuses, all of which are also valid `BookingRecordStatus` transitions.
    status: Exclude<ReservationStatus, "held">,
    reason?: string
  ): Promise<Reservation> {
    await this.ensureSeeded()
    const { reservation, prevStatus, userId } =
      await this.bookings.updateStatus(venueId, reservationId, status, reason)
    // This venue-scoped endpoint only ever moves a booking between the six
    // ReservationStatus values (the DTO restricts `status` to them), so a real
    // prevStatus is always one too — the payment-gate states are unreachable
    // from here today. Guard anyway so a future caller can't notify off them.
    const prevReservationStatus = prevStatus && asReservationStatus(prevStatus)
    if (prevReservationStatus && userId) {
      const notify = decisionNotification(
        reservationId,
        prevReservationStatus,
        status,
        reason
      )
      if (notify) await this.notifications.create(userId, notify)
      // Operator decline/cancel freezes the room's chat (quyết định #13) — keeps
      // history, blocks new sends. Best-effort: a chat failure (channel never
      // opened, Stream outage) must never fail the booking decision itself.
      // Walk-ins have no linked session and skip cleanly.
      if (status === "cancelled" && reservation.sessionId) {
        try {
          await this.stream.freezeChannelById(
            roomChannelId(reservation.sessionId)
          )
        } catch (err) {
          this.logger.warn(
            `Failed to freeze room chat for session ${reservation.sessionId}`,
            err instanceof Error ? err.stack : String(err)
          )
        }
      }
    }
    return reservation
  }

  async rescheduleReservation(
    venueId: string,
    reservationId: string,
    input: RescheduleReservationInput
  ): Promise<Reservation> {
    await this.ensureSeeded()
    return this.bookings.reschedule(venueId, reservationId, input)
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
        throw new ConflictException("A customer with this phone already exists")
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
