import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectConnection, InjectModel } from "@nestjs/mongoose"
import type { ClientSession, Connection, Model } from "mongoose"

import {
  initialsOf,
  isoDateOf,
  vnNowIso,
  canTransitionBooking,
  type BookingRecordStatus,
  type PaymentStatus,
  type Reservation,
  type SportKey,
  type VenueCourt,
  type VenueCustomer,
} from "../../shared/index.js"

import {
  isDuplicateKeyError,
  isTransactionsUnsupported,
  withVersionRetry,
} from "../../common/mongo-util.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { BookingLock, type BookingLockDocument } from "./booking-lock.schema.js"
import {
  assertWithinHours,
  bookingSlotFields,
  bookingsOverlap,
  buildBookingRecord,
  reservationFromBooking,
  type BookingSlot,
} from "./booking.helpers.js"
import { Booking, type BookingDocument } from "./booking.schema.js"

// ── Inputs ─────────────────────────────────────────────────────────────────

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

/** An app booking (player session) syncing into its owning venue's booking. */
export interface AppBookingSyncInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  userId: string
  sessionId: string
  customerName: string
  /** Set on re-writes so the same booking updates in place. */
  bookingId?: string
}

/** Status info a linked player session derives its view from (read-only). */
export interface BookingStatusInfo {
  venueId: string
  status: BookingRecordStatus
  paymentStatus: PaymentStatus
  declineReason?: string
  cancelReason?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Acquire a mutual-exclusion lock on `key` by inserting a doc (the unique
 * index rejects a second holder), run `fn`, then always release it. Bounded
 * spin-wait with backoff — used only when the deployment doesn't support
 * transactions (see `withOverlapGuard`).
 */
async function withCourtLock<T>(
  lockModel: Model<BookingLockDocument>,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const maxAttempts = 20
  for (let attempt = 1; ; attempt++) {
    try {
      await lockModel.create({ key })
      break
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= maxAttempts) {
        throw new ConflictException(
          "This slot is being booked by someone else — please try again"
        )
      }
      await sleep(20 * attempt)
    }
  }
  try {
    return await fn()
  } finally {
    await lockModel.deleteOne({ key }).catch(() => {})
  }
}

/**
 * Run `fn` inside a Mongoose transaction (a `ClientSession` is threaded into
 * every query `fn` makes) so the overlap check and the write it guards are
 * atomic. Atlas clusters (including the free M0 tier) are replica sets and
 * support this; when they don't (a standalone local `mongod`), fall back to
 * the per-court lock doc — same guarantee, coarser (serializes the whole
 * court+day rather than just conflicting writes).
 */
async function withOverlapGuard<T>(
  connection: Connection,
  lockModel: Model<BookingLockDocument>,
  lockKey: string,
  fn: (session?: ClientSession) => Promise<T>
): Promise<T> {
  try {
    return await connection.transaction((session) => fn(session))
  } catch (err) {
    if (!isTransactionsUnsupported(err)) throw err
    return withCourtLock(lockModel, lockKey, () => fn(undefined))
  }
}

// BookingsService owns the `bookings` collection — the canonical entity a
// court hold, a player's app booking and a venue's operator-facing reservation
// all converge on (VienTD-Review decision #1). It reads/writes the Venue doc
// directly (court catalog for validation/pricing, CRM customer upsert) rather
// than depending on VenuesService, and VenuesService/SessionsService both
// depend on this service instead of on each other — which is what dissolves
// the old Sessions↔Venues forwardRef cycle.
@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(BookingLock.name)
    private readonly lockModel: Model<BookingLockDocument>,
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>,
    @InjectConnection() private readonly connection: Connection
  ) {}

  // ── Venue doc helpers ──────────────────────────────────────────────────────

  private async loadVenueDoc(venueId: string): Promise<VenueDocument> {
    const doc = await this.venueModel.findOne({ venueId })
    if (!doc) throw new NotFoundException("Venue not found")
    return doc
  }

  private findCourt(doc: VenueDocument, courtId: string): VenueCourt {
    const court = doc.ops.courts.find((c) => c.id === courtId)
    if (!court) throw new NotFoundException("Court not found")
    return court
  }

  /** The venueId whose court catalog holds `courtId` (for the booking cross-write). */
  async findVenueByCourtId(courtId: string): Promise<string | null> {
    const doc = await this.venueModel
      .findOne({ "ops.courts.id": courtId })
      .select("venueId")
      .lean<{ venueId: string }>()
    return doc?.venueId ?? null
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Every booking for a venue, projected to the operator's Reservation shape. */
  async listForVenue(venueId: string): Promise<Reservation[]> {
    const docs = await this.bookingModel
      .find({ venueId })
      .sort({ createdAt: 1 })
      .lean()
    const today = isoDateOf(vnNowIso())
    return docs.map((d) => reservationFromBooking(d, today))
  }

  /**
   * The current status of each of `bookingIds`, for a player session to derive
   * its status/hold/refund view from at read time (no cross-write needed).
   */
  async statusFor(
    bookingIds: string[]
  ): Promise<Map<string, BookingStatusInfo>> {
    if (bookingIds.length === 0) return new Map()
    const docs = await this.bookingModel
      .find({ bookingId: { $in: bookingIds } })
      .lean()
    return new Map(
      docs.map((d) => [
        d.bookingId,
        {
          venueId: d.venueId,
          status: d.status,
          paymentStatus: d.paymentStatus,
          declineReason: d.declineReason,
          cancelReason: d.cancelReason,
        },
      ])
    )
  }

  // ── Overlap-guarded write ────────────────────────────────────────────────

  /**
   * Read the live bookings for `courtId`/`dateKey`, reject an overlap, then run
   * `write` — all inside one transaction (or, lacking transaction support, one
   * lock-guarded critical section) so a concurrent writer on the same
   * court+day can't slip past the check.
   */
  private async writeWithOverlapGuard(
    venueId: string,
    courtId: string,
    dateKey: string,
    start: string,
    durationMin: number,
    excludeId: string | undefined,
    write: (session?: ClientSession) => Promise<BookingDocument>
  ): Promise<BookingDocument> {
    const lockKey = `${venueId}:${courtId}:${dateKey}`
    return withOverlapGuard(
      this.connection,
      this.lockModel,
      lockKey,
      async (session) => {
        const query = this.bookingModel.find({ venueId, courtId, dateKey })
        const existing = await (session ? query.session(session) : query).lean<
          BookingSlot[]
        >()
        if (
          bookingsOverlap(
            existing,
            courtId,
            dateKey,
            start,
            durationMin,
            excludeId
          )
        ) {
          throw new ConflictException(
            "Selected time overlaps an existing reservation"
          )
        }
        return write(session)
      }
    )
  }

  // ── Walk-in ──────────────────────────────────────────────────────────────

  async createWalkIn(
    venueId: string,
    input: WalkInReservationInput
  ): Promise<Reservation> {
    const venueDoc = await this.loadVenueDoc(venueId)
    const court = this.findCourt(venueDoc, input.courtId)
    if (court.state === "maintenance") {
      throw new BadRequestException("Court is under maintenance")
    }
    assertWithinHours(venueDoc.info, input.start, input.durationMin)

    const created = await this.writeWithOverlapGuard(
      venueId,
      input.courtId,
      input.dayKey,
      input.start,
      input.durationMin,
      undefined,
      async (session) => {
        const record = buildBookingRecord({
          venueId,
          court,
          dateKey: input.dayKey,
          start: input.start,
          durationMin: input.durationMin,
          source: "walk-in",
          status: "confirmed",
          paymentStatus: "none",
          customer: {
            name: input.customerName.trim(),
            initials: initialsOf(input.customerName),
            phone: input.customerPhone.trim(),
          },
        })
        const [doc] = await this.bookingModel.create([record], { session })
        return doc
      }
    )

    return reservationFromBooking(created, isoDateOf(vnNowIso()))
  }

  // ── App booking cross-write (from a player session) ─────────────────────────

  /**
   * Create (or, on a re-write, update in place) the booking that mirrors a
   * player's app booking — the single shared record the operator then
   * approves, declines or checks in. Keyed by `bookingId` for idempotency: the
   * web re-PUTs the whole session on every edit, so a set id updates the
   * existing row (without downgrading an operator's status decision) rather
   * than duplicating. Returns null when `courtId` doesn't resolve to a venue
   * (not a real dated booking on a venue court).
   */
  async createOrSyncAppBooking(
    input: AppBookingSyncInput
  ): Promise<{ reservation: Reservation; venueId: string } | null> {
    const venueId = await this.findVenueByCourtId(input.courtId)
    if (!venueId) return null

    const venueDoc = await this.loadVenueDoc(venueId)
    const court = this.findCourt(venueDoc, input.courtId)
    assertWithinHours(venueDoc.info, input.start, input.durationMin)

    const existing = input.bookingId
      ? await this.bookingModel
          .findOne({ bookingId: input.bookingId, venueId })
          .lean<{ bookingId: string }>()
      : null

    const written = await this.writeWithOverlapGuard(
      venueId,
      input.courtId,
      input.dayKey,
      input.start,
      input.durationMin,
      existing?.bookingId,
      async (session) => {
        if (existing) {
          // Re-write of the same booking: refresh slot/court but keep the
          // operator's status decision (don't reset an approved booking).
          const fields = bookingSlotFields(
            court,
            input.dayKey,
            input.start,
            input.durationMin
          )
          const query = this.bookingModel.findOneAndUpdate(
            { bookingId: existing.bookingId, venueId },
            { $set: fields },
            { new: true }
          )
          const updated = await (session ? query.session(session) : query)
          if (!updated) throw new NotFoundException("Booking not found")
          return updated
        }
        const record = buildBookingRecord({
          venueId,
          court,
          dateKey: input.dayKey,
          start: input.start,
          durationMin: input.durationMin,
          source: "app",
          status: "pending",
          // No real payment gate yet (a future phase wires SePay); the app
          // flow already simulates the charge client-side before this fires.
          paymentStatus: "paid",
          userId: input.userId,
          sessionId: input.sessionId,
          customer: {
            name: input.customerName.trim(),
            initials: initialsOf(input.customerName),
          },
        })
        const [doc] = await this.bookingModel.create([record], { session })
        return doc
      }
    )

    await this.upsertAppCustomer(
      venueId,
      input.userId,
      input.customerName,
      court.sport
    )

    return {
      reservation: reservationFromBooking(written, isoDateOf(vnNowIso())),
      venueId,
    }
  }

  /** Add the app booker to the venue CRM once (linked by account), if new. */
  private async upsertAppCustomer(
    venueId: string,
    userId: string,
    name: string,
    sport: SportKey
  ): Promise<void> {
    await withVersionRetry(async () => {
      const doc = await this.venueModel.findOne({ venueId })
      if (!doc) return
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
      doc.markModified("ops")
      await doc.save()
    })
  }

  // ── Status + reschedule ──────────────────────────────────────────────────

  /**
   * Set a booking's status (approve/decline, check-in, cancel, no-show). One
   * fn backs every status transition; the caller maps its intent to a concrete
   * status. `prevStatus` comes back null on a same-status PUT (idempotent
   * no-op) so the caller can skip notifying the player twice for one decision.
   */
  async updateStatus(
    venueId: string,
    bookingId: string,
    status: BookingRecordStatus,
    reason?: string
  ): Promise<{
    reservation: Reservation
    prevStatus: BookingRecordStatus | null
    userId?: string
  }> {
    const result = await withVersionRetry(async () => {
      const doc = await this.bookingModel.findOne({ bookingId, venueId })
      if (!doc) throw new NotFoundException("Reservation not found")
      if (doc.status === status) return { doc, prevStatus: null }
      if (!canTransitionBooking(doc.status, status)) {
        throw new ConflictException(
          `Không thể chuyển đặt sân từ "${doc.status}" sang "${status}"`
        )
      }
      const prevStatus = doc.status
      doc.status = status
      if (status === "cancelled" && reason) doc.declineReason = reason
      if (status === "checked-in") doc.checkedInAt = vnNowIso()
      doc.statusHistory = [
        ...(doc.statusHistory ?? []),
        { status, at: vnNowIso(), reason },
      ]
      await doc.save()
      return { doc, prevStatus }
    })
    return {
      reservation: reservationFromBooking(result.doc, isoDateOf(vnNowIso())),
      prevStatus: result.prevStatus,
      userId: result.doc.userId,
    }
  }

  /**
   * Move a booking to a new day/time on its own court, re-running the same
   * opening-hours + overlap guards as a walk-in (excluding itself) and
   * re-deriving its price.
   */
  async reschedule(
    venueId: string,
    bookingId: string,
    input: RescheduleReservationInput
  ): Promise<Reservation> {
    const venueDoc = await this.loadVenueDoc(venueId)
    const existing = await this.bookingModel
      .findOne({ bookingId, venueId })
      .lean<{ courtId: string }>()
    if (!existing) throw new NotFoundException("Reservation not found")

    assertWithinHours(venueDoc.info, input.start, input.durationMin)
    const court = this.findCourt(venueDoc, existing.courtId)

    const updated = await this.writeWithOverlapGuard(
      venueId,
      existing.courtId,
      input.dayKey,
      input.start,
      input.durationMin,
      bookingId,
      async (session) => {
        const fields = bookingSlotFields(
          court,
          input.dayKey,
          input.start,
          input.durationMin
        )
        const query = this.bookingModel.findOneAndUpdate(
          { bookingId, venueId },
          { $set: fields },
          { new: true }
        )
        const doc = await (session ? query.session(session) : query)
        if (!doc) throw new NotFoundException("Reservation not found")
        return doc
      }
    )

    return reservationFromBooking(updated, isoDateOf(vnNowIso()))
  }
}
