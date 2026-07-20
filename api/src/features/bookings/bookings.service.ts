import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
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
  type RefundQueueItem,
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
import { NotificationsService } from "../notifications/notifications.service.js"
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
  liveBookingOverlap,
  refundPctFor,
  refundQueueItemFromBooking,
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

/**
 * Fallback minutes a venue has to approve/decline a paid booking before it
 * auto-confirms (decision #5), when `BOOKING_CONFIRM_SLA_MINUTES` is unset —
 * see `confirmSlaMinutes` below, which reads the configurable value.
 */
const DEFAULT_CONFIRM_SLA_MIN = 30

/** One sweep run's tally of guarded transitions actually applied — for logging/tests. */
export interface SweepResult {
  expired: number
  autoConfirmed: number
  completed: number
  /** bookingIds the sweeper expired — the caller cancels their gateway order. */
  expiredBookingIds: string[]
}

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
  private readonly logger = new Logger(BookingsService.name)

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
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  /** Decision #5's SLA window, minutes — overridable via `BOOKING_CONFIRM_SLA_MINUTES`. */
  private confirmSlaMinutes(): number {
    return this.config.get<number>(
      "BOOKING_CONFIRM_SLA_MINUTES",
      DEFAULT_CONFIRM_SLA_MIN
    )
  }

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
    // Exclude the two payment-gate states that aren't operator-actionable
    // bookings: an unpaid `awaiting_payment` hold (transient — it would project
    // to a "pending" the operator can't actually approve, since payment, not
    // the operator, gates that transition) and a lapsed `expired` hold (which
    // never became a booking). The slot each holds stays protected by the
    // overlap guard regardless of whether it appears in this list.
    const docs = await this.bookingModel
      .find({ venueId, status: { $nin: ["awaiting_payment", "expired"] } })
      .sort({ createdAt: 1 })
      .lean()
    const today = isoDateOf(vnNowIso())
    return docs.map((d) => reservationFromBooking(d, today))
  }

  /**
   * Every booking for a venue still owing a manual refund — SePay has no
   * refund API (decision #3/#9), so `applyRefund` below only *computes* the
   * refund and stamps `refund.status: "manual"`; this is the operator's
   * settle-by-hand worklist derived from that field, oldest refund first.
   */
  async listRefundQueue(venueId: string): Promise<RefundQueueItem[]> {
    const docs = await this.bookingModel
      .find({ venueId, "refund.status": "manual" })
      .sort({ "refund.at": 1 })
      .lean()
    const today = isoDateOf(vnNowIso())
    return docs.map((d) => refundQueueItemFromBooking(d, today))
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

  /**
   * True when `venueId` (optionally narrowed to one `courtId`) has a
   * `pending`/`confirmed` booking whose `startAt` is still in the future —
   * VienTD-Review decision #11's archive guard for `DELETE /api/venues`
   * (whole venue) and `DELETE /api/venues/courts/:courtId` (one court): both
   * refuse to archive while this is true, so the operator must cancel+refund
   * first. `checked-in`/`completed`/terminal statuses don't block archiving —
   * only bookings still awaiting their outcome do.
   */
  async hasFutureLiveBookings(
    venueId: string,
    courtId?: string
  ): Promise<boolean> {
    const filter: Record<string, unknown> = {
      venueId,
      status: { $in: ["pending", "confirmed"] },
      startAt: { $gt: vnNowIso() },
    }
    if (courtId) filter.courtId = courtId
    return (await this.bookingModel.exists(filter)) !== null
  }

  /**
   * True when a proposed court block (`courtId`/`dateKey`/`start`/`durationMin`)
   * overlaps a live booking (pending/confirmed/checked-in) — the guard
   * `VenuesService#addBlock` runs before writing a new `CourtBlock` (decision
   * #12: a block may never land on top of a booking someone is honoring).
   */
  async hasLiveBookingOverlap(
    venueId: string,
    courtId: string,
    dateKey: string,
    start: string,
    durationMin: number
  ): Promise<boolean> {
    const existing = await this.bookingModel
      .find({ venueId, courtId, dateKey })
      .select("bookingId courtId dateKey start durationMin status")
      .lean<BookingSlot[]>()
    return liveBookingOverlap(existing, courtId, dateKey, start, durationMin)
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
    if (court.archived) {
      throw new BadRequestException("Court has been archived")
    }
    if (court.state === "maintenance") {
      throw new BadRequestException("Court is under maintenance")
    }
    assertWithinHours(venueDoc.info, input.start, input.durationMin)
    assertNoCourtBlock(
      venueDoc.ops.blocks ?? [],
      input.courtId,
      input.dayKey,
      input.start,
      input.durationMin
    )

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

    // Merge the walk-in into the venue CRM by phone (decision #15's default:
    // "walk-in tạo/merge CRM customer theo phone"). Stats start zeroed — a
    // completed booking is what makes a "visit", derived at read time by
    // `computeCustomerStats` (`withComputedStats`), never written here.
    await this.upsertWalkInCustomer(
      venueId,
      input.customerName,
      input.customerPhone,
      court.sport
    )

    return reservationFromBooking(created, isoDateOf(vnNowIso()))
  }

  // ── CRM customer sync (app + walk-in) ───────────────────────────────────────

  /** A freshly onboarded CRM row — every stat derives at read time, never here. */
  private zeroedCustomer(
    id: string,
    name: string,
    sport: SportKey,
    userId?: string
  ): VenueCustomer {
    return {
      id,
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
      doc.ops.customers.push(this.zeroedCustomer(userId, name, sport, userId))
      doc.markModified("ops")
      await doc.save()
    })
  }

  /** Add/merge a walk-in into the venue CRM by phone, if new (decision #15). */
  private async upsertWalkInCustomer(
    venueId: string,
    name: string,
    phone: string,
    sport: SportKey
  ): Promise<void> {
    const id = phone.trim()
    if (!id) return
    await withVersionRetry(async () => {
      const doc = await this.venueModel.findOne({ venueId })
      if (!doc) return
      if (doc.ops.customers.some((c) => c.id === id)) return
      doc.ops.customers.push(this.zeroedCustomer(id, name, sport))
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
        if (status === "cancelled") {
          if (reason) d.declineReason = reason
          // A venue-initiated cancel/decline is the venue's fault, not the
          // player's — a flat 100% refund (decision #6), the same as `decide`'s
          // decline path. `applyRefund` no-ops unless the booking was actually
          // paid, so an unpaid hold cancels clean.
          this.applyRefund(d, 100)
        }
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

    const court = this.findCourt(venueDoc, existing.courtId)
    if (court.archived) {
      throw new BadRequestException("Court has been archived")
    }
    if (court.state === "maintenance") {
      throw new BadRequestException("Court is under maintenance")
    }
    assertWithinHours(venueDoc.info, input.start, input.durationMin)
    // The same court-block guard app-booking/walk-in creation runs (decision
    // #12) — an operator can't reschedule a reservation onto a slot they've
    // blocked out for maintenance/internal use.
    assertNoCourtBlock(
      venueDoc.ops.blocks ?? [],
      existing.courtId,
      input.dayKey,
      input.start,
      input.durationMin
    )

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

  // ── Payment gateway seam (`PaymentsService`, Phase 4) ───────────────────────

  /**
   * Confirm a booking's SePay payment — `awaiting_payment` → `pending` with a
   * fresh `confirmDeadlineAt` (decision #5: venue approval SLA — overridable
   * via `BOOKING_CONFIRM_SLA_MINUTES`, default 30 minutes — silence =
   * approve). Called by `PaymentsService` once its own IPN idempotency
   * (`Payment.invoiceNumber` unique + guarded `findOneAndUpdate`) has
   * confirmed this is the *first* time the order was marked paid — but this
   * method is itself idempotent too (a booking already past
   * `awaiting_payment` is a no-op), so a defensive double-call from a
   * retried/replayed IPN never re-applies the transition or clobbers a
   * status the venue has already moved on from.
   */
  async confirmPayment(bookingId: string): Promise<BookingDocument | null> {
    return withVersionRetry(async () => {
      const doc = await this.bookingModel.findOne({ bookingId })
      if (!doc) return null
      if (doc.status === "awaiting_payment") {
        doc.status = "pending"
        doc.paymentStatus = "paid"
        doc.confirmDeadlineAt = addMinutesToIso(
          vnNowIso(),
          this.confirmSlaMinutes()
        )
        doc.statusHistory = [
          ...(doc.statusHistory ?? []),
          { status: "pending", at: vnNowIso() },
        ]
        await doc.save()
        return doc
      }
      // Payment landed *after* the hold had already lapsed (the sweeper moved it
      // to `expired`) or the booking was cancelled — the slot is gone, so the
      // money the player just paid is owed straight back rather than silently
      // kept with no booking to show for it. Record the payment and queue a full
      // refund, guarded on the absence of an existing refund so a replayed IPN
      // can't re-queue it.
      if (
        (doc.status === "expired" || doc.status === "cancelled") &&
        doc.paymentStatus !== "paid" &&
        !doc.refund
      ) {
        doc.paymentStatus = "paid"
        this.applyRefund(doc, 100)
        await doc.save()
        if (doc.userId) {
          await this.notifications.create(doc.userId, {
            id: `booking-late-refund-${bookingId}`,
            kind: "booking",
            text: "Thanh toán đã nhận nhưng lượt giữ chỗ đã hết hạn — khoản tiền sẽ được hoàn lại (mô phỏng).",
            href: "/dashboard/bookings",
          })
        }
        return doc
      }
      // Already pending/confirmed/checked-in/completed — an idempotent no-op for
      // a defensive double-call from a retried/replayed IPN.
      return doc
    })
  }

  // ── Scheduler sweep (Phase 5) ───────────────────────────────────────────────

  /**
   * Run every guarded, idempotent booking transition that's driven by the
   * clock rather than a person (`payments/bookings-sweeper.service.ts` calls
   * this every minute): an unpaid hold past `holdExpiresAt` expires; a
   * `pending` (paid) booking whose venue hasn't decided within the confirm
   * SLA silently auto-confirms (decision #5, "silence = consent"), notifying
   * the player; a checked-in booking past its `endAt` completes. No-show
   * stays a manual venue action — an empty court isn't a fact the clock alone
   * can establish.
   *
   * Each rule's query filters on the *current* status, so re-running the
   * sweep (the whole point of a cron) only ever touches bookings still due a
   * transition. Each individual transition goes through `setStatus`, which
   * re-reads the doc under `withVersionRetry` and no-ops on a same-status
   * write — so a booking a concurrent operator decision already moved past
   * this rule's expected `from` status is silently skipped rather than
   * clobbered (`canTransitionBooking` would reject the stale transition, and
   * that per-booking failure is swallowed so the rest of the batch proceeds).
   * `expiredBookingIds` comes back for the caller (the sweeper trigger,
   * `bookings-sweeper.service.ts`) to cancel each one's SePay order via
   * `PaymentsService` — a payments-side concern this service doesn't depend
   * on, to avoid a module cycle with `PaymentsModule`.
   */
  async sweep(now: string = vnNowIso()): Promise<SweepResult> {
    const result: SweepResult = {
      expired: 0,
      autoConfirmed: 0,
      completed: 0,
      expiredBookingIds: [],
    }

    const expiring = await this.bookingModel
      .find({ status: "awaiting_payment", holdExpiresAt: { $lte: now } })
      .select("bookingId venueId")
      .lean<{ bookingId: string; venueId: string }[]>()
    for (const b of expiring) {
      const applied = await this.trySetStatus(b.venueId, b.bookingId, "expired")
      if (applied) {
        result.expired++
        result.expiredBookingIds.push(b.bookingId)
      }
    }

    const confirming = await this.bookingModel
      .find({
        status: "pending",
        paymentStatus: "paid",
        confirmDeadlineAt: { $lte: now },
      })
      .select("bookingId venueId userId")
      .lean<{ bookingId: string; venueId: string; userId?: string }[]>()
    for (const b of confirming) {
      const applied = await this.trySetStatus(b.venueId, b.bookingId, "confirmed")
      if (applied) {
        result.autoConfirmed++
        if (b.userId) {
          const notify = decisionNotification(
            b.bookingId,
            "pending",
            "confirmed",
            undefined,
            true // auto — every sweeper confirm is silent consent
          )
          if (notify) await this.notifications.create(b.userId, notify)
        }
      }
    }

    const completing = await this.bookingModel
      .find({ status: "checked-in", endAt: { $lte: now } })
      .select("bookingId venueId")
      .lean<{ bookingId: string; venueId: string }[]>()
    for (const b of completing) {
      const applied = await this.trySetStatus(b.venueId, b.bookingId, "completed")
      if (applied) result.completed++
    }

    return result
  }

  /**
   * `setStatus`, but for the sweeper: swallows any failure (a stale
   * transition from a concurrent operator decision — `ConflictException` —
   * or a booking that vanished between the sweep's query and this write —
   * `NotFoundException` — or an unexpected DB error) instead of throwing, so
   * one bad booking never aborts the rest of the batch; the next tick just
   * retries it. Returns whether the transition actually applied (false for a
   * swallowed failure and for an idempotent same-status no-op).
   */
  private async trySetStatus(
    venueId: string,
    bookingId: string,
    status: BookingRecordStatus
  ): Promise<boolean> {
    try {
      const { prevStatus } = await this.setStatus(venueId, bookingId, status)
      return prevStatus !== null
    } catch (err) {
      this.logger.warn(
        `Sweep: failed to transition booking ${bookingId} to "${status}": ${err instanceof Error ? err.message : String(err)}`
      )
      return false
    }
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
    if (court.archived) {
      throw new BadRequestException("Court has been archived")
    }
    if (court.state === "maintenance") {
      throw new BadRequestException("Court is under maintenance")
    }
    assertWithinHours(venueDoc.info, input.start, input.durationMin)
    assertNoCourtBlock(
      venueDoc.ops.blocks ?? [],
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
    if (
      userBookingsOverlap(own, input.dateKey, input.start, input.durationMin)
    ) {
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

    // Same CRM sync the pre-Phase-3 cross-write used to do inline — an app
    // booker becomes a venue customer (visits/ltv/tier derive from completed
    // bookings, not from this write) the first time they book that venue.
    await this.upsertAppCustomer(
      venueId,
      userId,
      profile.user.name,
      court.sport
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
      if (notify) await this.notifications.create(doc.userId, notify)
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
  async markNoShow(
    callerId: string,
    bookingId: string
  ): Promise<BookingSummary> {
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
      if (notify) await this.notifications.create(result.userId, notify)
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
      // SePay has no refund API (only voidTransaction/cancel for a
      // not-yet-settled transaction/order) — every refund here is queued for
      // an operator to send by hand, never issued automatically.
      status: "manual",
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
