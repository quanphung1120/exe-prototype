import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectConnection, InjectModel } from "@nestjs/mongoose"
import type { ClientSession, Connection, Model } from "mongoose"

import {
  addMinutesToIso,
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
import { ProfileService } from "../players/profile.service.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { BookingLock, type BookingLockDocument } from "./booking-lock.schema.js"
import {
  assertNoCourtBlock,
  assertWithinHours,
  bookingSlotFields,
  bookingSummaryFrom,
  bookingsOverlap,
  buildBookingRecord,
  decisionNotification,
  refundPctFor,
  reservationFromBooking,
  userBookingsOverlap,
  type BookingSlot,
  type BookingSummary,
  type UserBookingSlot,
} from "./booking.helpers.js"
import { Booking, type BookingDocument } from "./booking.schema.js"

/** A hold-worthy booking request from a signed-in player (`POST /api/bookings`). */
export interface CreateBookingInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  sessionId?: string
}

/** Minutes an unpaid `awaiting_payment` hold keeps its slot before it lapses. */
const HOLD_MIN = 20

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
    @InjectConnection() private readonly connection: Connection,
    // Explicit token (not just the TS type) since esbuild-based runners like
    // tsx don't emit the design:paramtypes metadata Nest's implicit
    // constructor-injection would otherwise rely on.
    @Inject(ProfileService) private readonly profiles: ProfileService
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
   * Core status mutation shared by every status-changing entry point (the
   * venue-scoped `updateStatus` below and the narrower player/venue actions
   * further down — `decide`/`checkIn`/`markNoShow`/`cancel`). Guards the
   * transition, stamps `checkedInAt`, appends `statusHistory`, and lets the
   * caller apply extra field changes (e.g. a refund) via `extra` before the
   * single `save()` — so every caller shares one optimistic-concurrency retry
   * loop instead of each re-deriving it.
   */
  private async setStatus(
    venueId: string,
    bookingId: string,
    status: BookingRecordStatus,
    reason?: string,
    extra?: (doc: BookingDocument) => void
  ): Promise<{ doc: BookingDocument; prevStatus: BookingRecordStatus | null }> {
    return withVersionRetry(async () => {
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
      if (status === "checked-in") doc.checkedInAt = vnNowIso()
      extra?.(doc)
      doc.statusHistory = [
        ...(doc.statusHistory ?? []),
        { status, at: vnNowIso(), reason },
      ]
      await doc.save()
      return { doc, prevStatus }
    })
  }

  /**
   * Set a booking's status (approve/decline, check-in, cancel, no-show) from
   * the venue-scoped reservation route (`VenuesService#updateReservationStatus`).
   * `prevStatus` comes back null on a same-status PUT (idempotent no-op) so the
   * caller can skip notifying the player twice for one decision.
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
    const { doc, prevStatus } = await this.setStatus(
      venueId,
      bookingId,
      status,
      reason,
      (d) => {
        if (status === "cancelled" && reason) d.declineReason = reason
      }
    )
    return {
      reservation: reservationFromBooking(doc, isoDateOf(vnNowIso())),
      prevStatus,
      userId: doc.userId,
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

  // ── Player-facing bookings API (`BookingsController`, Phase 3) ─────────────

  /**
   * Create a fresh unpaid hold (`awaiting_payment`) for a signed-in player —
   * `POST /api/bookings`. Validates opening hours, the per-court/day overlap
   * guard (shared with walk-ins/app-sync), and the caller's own cross-venue
   * self-overlap (hard block — a player can't hold two courts at the same
   * time, VienTD-Review decision #8). `holdExpiresAt` is computed here,
   * server-side, replacing the web's client-only `HOLD_MS` countdown.
   */
  async createHold(
    userId: string,
    input: CreateBookingInput
  ): Promise<BookingSummary> {
    const venueId = await this.findVenueByCourtId(input.courtId)
    if (!venueId) throw new NotFoundException("Court not found")
    const venueDoc = await this.loadVenueDoc(venueId)
    const court = this.findCourt(venueDoc, input.courtId)
    if (court.state === "maintenance") {
      throw new BadRequestException("Court is under maintenance")
    }
    assertWithinHours(venueDoc.info, input.start, input.durationMin)
    // Seam for Phase 6 (court blocks) — a no-op today, see booking.helpers.ts.
    assertNoCourtBlock(
      venueId,
      input.courtId,
      input.dateKey,
      input.start,
      input.durationMin
    )

    // Self-overlap hard block. Best-effort (outside the per-court transaction
    // below, which only serializes one court+day — a user racing two holds on
    // *different* courts at once is an accepted edge case here).
    const own = await this.bookingModel
      .find({ userId, dateKey: input.dateKey })
      .select("bookingId dateKey start durationMin status")
      .lean<UserBookingSlot[]>()
    if (userBookingsOverlap(own, input.dateKey, input.start, input.durationMin)) {
      throw new ConflictException(
        "Bạn đã có một lượt đặt sân khác trong khung giờ này"
      )
    }

    const profile = await this.profiles.getProfile(userId)

    const created = await this.writeWithOverlapGuard(
      venueId,
      input.courtId,
      input.dateKey,
      input.start,
      input.durationMin,
      undefined,
      async (session) => {
        const record = buildBookingRecord({
          venueId,
          court,
          dateKey: input.dateKey,
          start: input.start,
          durationMin: input.durationMin,
          source: "app",
          status: "awaiting_payment",
          paymentStatus: "awaiting",
          userId,
          sessionId: input.sessionId,
          customer: {
            name: profile.user.name,
            initials: profile.user.initials,
          },
          holdExpiresAt: addMinutesToIso(vnNowIso(), HOLD_MIN),
        })
        const [doc] = await this.bookingModel.create([record], { session })
        return doc
      }
    )

    return bookingSummaryFrom(created)
  }

  /** Every booking the signed-in player owns, soonest start first. */
  async listMine(userId: string): Promise<BookingSummary[]> {
    const docs = await this.bookingModel
      .find({ userId })
      .sort({ startAt: 1 })
      .lean()
    return docs.map(bookingSummaryFrom)
  }

  /**
   * Cancel the caller's own booking (`POST /api/bookings/:id/cancel`) and
   * compute its refund per the time-before-start policy (decision #6): ≥24h →
   * 100%, <24h → 50%, at/after the start time → 0%. Only refunds a booking
   * that was actually paid — an unpaid `awaiting_payment` hold cancels clean.
   */
  async cancel(
    userId: string,
    bookingId: string,
    reason?: string
  ): Promise<BookingSummary> {
    const booking = await this.bookingModel
      .findOne({ bookingId })
      .select("venueId userId startAt")
      .lean<{ venueId: string; userId?: string; startAt: string }>()
    if (!booking) throw new NotFoundException("Booking not found")
    if (booking.userId !== userId) {
      throw new ForbiddenException("This booking belongs to another account")
    }
    const pct = refundPctFor(vnNowIso(), booking.startAt)
    const { doc } = await this.setStatus(
      booking.venueId,
      bookingId,
      "cancelled",
      reason,
      (d) => {
        d.cancelReason = reason
        this.applyRefund(d, pct)
      }
    )
    return bookingSummaryFrom(doc)
  }

  /**
   * Approve or decline a pending app booking (`POST /api/bookings/:id/decision`)
   * — the venue that owns the booking's venue must be the caller. A decline
   * is always a flat 100% refund (the venue's fault, not the player's —
   * decision #6), applied whenever the booking was actually paid.
   */
  async decide(
    callerId: string,
    bookingId: string,
    decision: "approve" | "decline",
    reason?: string
  ): Promise<BookingSummary> {
    const venueId = await this.assertOwnsBookingVenue(callerId, bookingId)
    const status: BookingRecordStatus =
      decision === "approve" ? "confirmed" : "cancelled"
    const { doc, prevStatus } = await this.setStatus(
      venueId,
      bookingId,
      status,
      reason,
      (d) => {
        if (decision === "decline") {
          d.declineReason = reason
          this.applyRefund(d, 100)
        }
      }
    )
    // `decisionNotification` speaks the six-value `ReservationStatus`; the two
    // payment-gate states (`awaiting_payment`/`expired`) that `prevStatus` could
    // also be here don't map onto it, so those stay silent (same convention as
    // `VenuesService#asReservationStatus`).
    const prevReservationStatus =
      prevStatus === "awaiting_payment" || prevStatus === "expired"
        ? null
        : prevStatus
    if (prevReservationStatus && doc.userId) {
      const notify = decisionNotification(
        bookingId,
        prevReservationStatus,
        status,
        reason
      )
      if (notify) await this.profiles.addNotification(doc.userId, notify)
    }
    return bookingSummaryFrom(doc)
  }

  /** Check a confirmed booking's customer in (`POST /api/bookings/:id/check-in`). */
  async checkIn(callerId: string, bookingId: string): Promise<BookingSummary> {
    const venueId = await this.assertOwnsBookingVenue(callerId, bookingId)
    const { doc } = await this.setStatus(venueId, bookingId, "checked-in")
    return bookingSummaryFrom(doc)
  }

  /**
   * Mark a confirmed booking a no-show (`POST /api/bookings/:id/no-show`) —
   * rejected unless the customer never checked in *and* at least 30 minutes
   * have passed since the booking's start time (gives a late arrival a grace
   * window before the venue can free the slot to walk-ins).
   */
  async markNoShow(callerId: string, bookingId: string): Promise<BookingSummary> {
    const venueId = await this.assertOwnsBookingVenue(callerId, bookingId)
    const result = await withVersionRetry(async () => {
      const doc = await this.bookingModel.findOne({ bookingId, venueId })
      if (!doc) throw new NotFoundException("Reservation not found")
      if (doc.status === "no-show") return doc
      if (doc.status !== "confirmed" || doc.checkedInAt) {
        throw new ConflictException(
          "Chỉ có thể đánh dấu vắng mặt cho lượt đặt đã duyệt và chưa check-in"
        )
      }
      const now = vnNowIso()
      if (
        new Date(now).getTime() <
        new Date(doc.startAt).getTime() + 30 * 60_000
      ) {
        throw new BadRequestException(
          "Chỉ có thể đánh dấu vắng mặt sau ít nhất 30 phút kể từ giờ bắt đầu"
        )
      }
      doc.status = "no-show"
      doc.statusHistory = [
        ...(doc.statusHistory ?? []),
        { status: "no-show", at: now },
      ]
      await doc.save()
      return doc
    })
    if (result.userId) {
      const notify = decisionNotification(bookingId, "confirmed", "no-show")
      if (notify) await this.profiles.addNotification(result.userId, notify)
    }
    return bookingSummaryFrom(result)
  }

  /** Apply a refund of `pct`% of `doc.price`, only when it was actually paid. */
  private applyRefund(doc: BookingDocument, pct: number): void {
    if (doc.paymentStatus !== "paid" || pct <= 0) return
    doc.refund = {
      pct,
      amount: Math.round((doc.price * pct) / 100),
      at: vnNowIso(),
    }
    doc.paymentStatus = pct >= 100 ? "refunded" : "partial_refund"
  }

  /** The venueId a booking belongs to, after confirming the caller owns it. */
  private async assertOwnsBookingVenue(
    userId: string,
    bookingId: string
  ): Promise<string> {
    const booking = await this.bookingModel
      .findOne({ bookingId })
      .select("venueId")
      .lean<{ venueId: string }>()
    if (!booking) throw new NotFoundException("Booking not found")
    const venue = await this.venueModel
      .findOne({ venueId: booking.venueId })
      .select("ownerId")
      .lean<{ ownerId?: string }>()
    if (!venue || venue.ownerId !== userId) {
      throw new ForbiddenException("You do not manage this venue")
    }
    return booking.venueId
  }
}
