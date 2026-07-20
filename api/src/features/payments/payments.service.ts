import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { vnNowIso } from "../../shared/index.js"

import { Booking, type BookingDocument } from "../bookings/booking.schema.js"
import { BookingsService } from "../bookings/bookings.service.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { Payment, type PaymentDocument, type PaymentRecordStatus } from "./payment.schema.js"
import {
  SEPAY_CLIENT,
  type SepayClientPort,
  type SepayIpnHeaders,
  type SepayIpnPayload,
} from "./sepay.client.js"

/** The shape `PaymentsController` returns from checkout/by-booking. */
export interface PaymentSummary {
  bookingId: string
  invoiceNumber: string
  amount: number
  currency: string
  status: PaymentRecordStatus
  checkoutUrl?: string
  paidAt?: string
}

/** `POST /api/payments/checkout` response — the summary plus the signed form to submit. */
export interface CheckoutResult {
  payment: PaymentSummary
  fields: Record<string, string | number | undefined>
  checkoutUrl: string
}

function toPaymentSummary(doc: Payment): PaymentSummary {
  return {
    bookingId: doc.bookingId,
    invoiceNumber: doc.invoiceNumber,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    checkoutUrl: doc.checkoutUrl,
    paidAt: doc.paidAt,
  }
}

/** A remote SePay order's status field, as read back from `order.retrieve()`. */
interface RemoteOrder {
  order_status?: string
}

const PAID_REMOTE_STATUSES = new Set(["PAID", "paid"])

/**
 * SePay checkout + IPN (VienTD-Review Phase 4). Owns the `payments`
 * collection — one `Payment` doc per booking (`invoiceNumber` == `bookingId`,
 * unique, doubling as the idempotency key both the checkout upsert and the
 * IPN's guarded `findOneAndUpdate` rely on) — and delegates the booking-side
 * transition (`awaiting_payment` → `pending`, `confirmDeadlineAt` set) to
 * `BookingsService#confirmPayment` rather than writing `Booking` docs
 * directly, so that state machine stays owned by one feature.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private readonly returnUrl: string

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Venue.name)
    private readonly venueModel: Model<VenueDocument>,
    @Inject(SEPAY_CLIENT) private readonly sepay: SepayClientPort,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    // Explicit token (not just the TS type) since esbuild-based runners like
    // tsx don't emit the design:paramtypes metadata implicit constructor
    // injection would otherwise rely on — see the same note on
    // NotificationsService above and throughout bookings.service.ts.
    @Inject(ConfigService) config: ConfigService
  ) {
    this.returnUrl = config.getOrThrow<string>("SEPAY_RETURN_URL")
  }

  // ── Checkout ─────────────────────────────────────────────────────────────

  /**
   * Start (or resume) a SePay checkout for the caller's own `awaiting_payment`
   * hold — `POST /api/payments/checkout`. Charges 100% of the booking price
   * (decision #3, no deposit model). Re-POSTing for the same booking before
   * it's paid reuses the same `Payment` doc/invoice (the upsert below is keyed
   * on `bookingId`) instead of opening a second order.
   */
  async checkout(userId: string, bookingId: string): Promise<CheckoutResult> {
    const booking = await this.bookingModel
      .findOne({ bookingId })
      .select("venueId userId status price courtName")
      .lean<{
        venueId: string
        userId?: string
        status: string
        price: number
        courtName: string
      }>()
    if (!booking) throw new NotFoundException("Booking not found")
    if (booking.userId !== userId) {
      throw new ForbiddenException("This booking belongs to another account")
    }
    if (booking.status !== "awaiting_payment") {
      throw new ConflictException(
        `Cannot start checkout for a booking in status "${booking.status}"`
      )
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      { bookingId },
      {
        $setOnInsert: {
          invoiceNumber: bookingId,
          bookingId,
          venueId: booking.venueId,
          userId,
          amount: booking.price,
          currency: "VND",
          status: "awaiting",
        },
      },
      { upsert: true, new: true }
    )
    if (payment.status !== "awaiting") {
      throw new ConflictException("Payment already settled for this booking")
    }

    const { fields, checkoutUrl } = this.sepay.initCheckout({
      invoiceNumber: payment.invoiceNumber,
      amountVnd: payment.amount,
      description: `Thanh toan dat san ${booking.courtName} - ${bookingId}`,
      successUrl: `${this.returnUrl}/${bookingId}`,
    })
    payment.checkoutUrl = checkoutUrl
    await payment.save()

    return { payment: toPaymentSummary(payment), fields, checkoutUrl }
  }

  // ── Status polling ───────────────────────────────────────────────────────

  /**
   * `GET /api/payments/by-booking/:id` — the player polls this while on the
   * SePay checkout page/return screen. When still `awaiting`, reconciles
   * against `client.order.retrieve()` first: a paid order whose IPN hasn't
   * landed yet (tunnel hiccup in dev, delivery delay in prod) would otherwise
   * strand the player on a "waiting for payment" screen the IPN alone can't
   * unstick. Best-effort — a reconciliation failure just defers to the next
   * poll or the IPN, it never fails the read.
   */
  async byBooking(userId: string, bookingId: string): Promise<PaymentSummary> {
    const payment = await this.paymentModel.findOne({ bookingId })
    if (!payment) throw new NotFoundException("Payment not found")
    if (payment.userId && payment.userId !== userId) {
      throw new ForbiddenException("This payment belongs to another account")
    }
    if (payment.status !== "awaiting") return toPaymentSummary(payment)

    try {
      const remote = (await this.sepay.retrieveOrder(
        payment.invoiceNumber
      )) as RemoteOrder | undefined
      if (remote && PAID_REMOTE_STATUSES.has(remote.order_status ?? "")) {
        const paid = await this.markPaid(payment.invoiceNumber, remote)
        if (paid) return toPaymentSummary(paid)
      }
    } catch (err) {
      this.logger.warn(
        `SePay order.retrieve(${payment.invoiceNumber}) failed — deferring to the IPN/next poll: ${String(err)}`
      )
    }
    return toPaymentSummary(payment)
  }

  // ── IPN ──────────────────────────────────────────────────────────────────

  /**
   * `POST /api/payments/ipn` (`@Public()`) — SePay's server-to-server payment
   * notification. Verifies the HMAC signature before touching anything,
   * idempotently marks the `Payment` paid (`findOneAndUpdate` filtered on
   * `status: "awaiting"` — a replayed IPN for an already-paid invoice matches
   * nothing and is a silent no-op), then confirms the booking and notifies
   * the venue. Always resolves (returns `{received:true}`, never throws for a
   * business-logic mismatch) except for a bad signature — SePay expects a 200
   * to stop retrying, and only an unauthenticated call should get anything else.
   */
  async handleIpn(
    rawBody: Buffer,
    headers: SepayIpnHeaders
  ): Promise<{ received: boolean }> {
    if (!this.sepay.verifyIpnSignature(rawBody, headers)) {
      throw new UnauthorizedException("Invalid IPN signature")
    }

    let payload: SepayIpnPayload
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as SepayIpnPayload
    } catch {
      throw new BadRequestException("Malformed IPN payload")
    }

    const invoiceNumber = payload.order?.order_invoice_number
    if (payload.notification_type !== "ORDER_PAID" || !invoiceNumber) {
      // Not a paid-order notification we act on (e.g. TRANSACTION_VOID) —
      // acknowledge without a side effect.
      return { received: true }
    }

    await this.markPaid(invoiceNumber, payload)
    return { received: true }
  }

  /**
   * The one place a `Payment` actually flips to `paid` — shared by the IPN
   * handler and the `byBooking` reconciliation fallback so both go through the
   * same idempotency guard and the same booking-confirm + venue-notify
   * follow-through. Returns the updated doc, or `null` on a replay/unknown
   * invoice (nothing left to do).
   */
  private async markPaid(
    invoiceNumber: string,
    rawPayload: unknown
  ): Promise<PaymentDocument | null> {
    const updated = await this.paymentModel.findOneAndUpdate(
      { invoiceNumber, status: "awaiting" },
      { $set: { status: "paid", paidAt: vnNowIso(), ipnPayload: rawPayload } },
      { new: true }
    )
    if (!updated) return null

    const bookingDoc = await this.bookings.confirmPayment(updated.bookingId)
    // Only ping the venue when the payment actually produced a booking awaiting
    // their decision. A payment that landed after the hold expired confirms to
    // nobody — `confirmPayment` refunds it instead of moving it to `pending` —
    // so notifying the venue of an "approvable" booking would be misleading.
    if (bookingDoc?.status === "pending") {
      await this.notifyVenue(bookingDoc.venueId, updated.bookingId).catch((err: unknown) => {
        // A notification failure must never undo a real payment — log and move on.
        this.logger.warn(
          `Failed to notify venue ${bookingDoc.venueId} of paid booking ${updated.bookingId}: ${String(err)}`
        )
      })
    }
    return updated
  }

  /** Notify the venue owner a booking just paid and is awaiting their decision. */
  private async notifyVenue(venueId: string, bookingId: string): Promise<void> {
    const venue = await this.venueModel
      .findOne({ venueId })
      .select("ownerId")
      .lean<{ ownerId?: string }>()
    if (!venue?.ownerId) return
    await this.notifications.create(venue.ownerId, {
      id: `payment-paid-${bookingId}`,
      kind: "booking",
      text: "Có lượt đặt sân mới đã thanh toán — vui lòng duyệt trong vòng 30 phút (im lặng sẽ tự động duyệt).",
      href: `/dashboard/venue/${venueId}/schedule`,
    })
  }

  // ── Phase 5 seam ─────────────────────────────────────────────────────────

  /**
   * Cancel a booking's still-open SePay order — the `+ client.order.cancel()
   * bên SePay` half of Phase 5's sweeper rule (`awaiting_payment &&
   * holdExpiresAt ≤ now → expired`). A no-op when checkout was never started
   * or the payment already settled one way or another, so the sweeper can
   * call this unconditionally for every hold it expires.
   */
  async cancelOrderForBooking(bookingId: string): Promise<void> {
    const payment = await this.paymentModel.findOne({ bookingId })
    if (!payment || payment.status !== "awaiting") return
    await this.sepay.cancelOrder(payment.invoiceNumber)
    payment.status = "cancelled"
    await payment.save()
  }
}
