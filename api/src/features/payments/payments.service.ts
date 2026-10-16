import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import type {
  BankAccount,
  BookingRecord,
  BookingRecordStatus,
} from "../../shared/index.js"
import type { BookingSummary } from "../bookings/booking.helpers.js"
import { Booking, type BookingDocument } from "../bookings/booking.schema.js"
import { BookingsService } from "../bookings/bookings.service.js"
import { PayoutService } from "../brands/payout.service.js"
import type { PayoutDto } from "../brands/payout.dto.js"
import { DiscountsService } from "../discounts/discounts.service.js"
import { ProfileService } from "../players/profile.service.js"
import type { VenuePhotoUploadSignature } from "../venues/venue-photos.service.js"
import { ProofUploadService } from "./proof-upload.service.js"
import { buildVietQrImageUrl, generateTransferMemo } from "./vietqr.js"

/** What the payment screen shows: where to transfer, how much, and the memo. */
export interface PaymentStart {
  bookingId: string
  /** VND to transfer (the booking price minus any discount). */
  amount: number
  originalAmount: number
  discountCode?: string
  discountAmount?: number
  /** The memo the player must put in the transfer. */
  transferMemo: string
  /** A VietQR image that pre-fills bank, account, amount and memo. */
  qrUrl: string
  /** The venue's account, copied when the player started paying. */
  account: BankAccount
  /** The player's saved refund account, to pre-fill the form. */
  refundAccount: BankAccount | null
}

type StartableBooking = Pick<
  BookingRecord,
  | "venueId"
  | "userId"
  | "status"
  | "price"
  | "amountDue"
  | "transferMemo"
  | "payoutSnapshot"
  | "discountCode"
  | "discountAmount"
  | "originalAmount"
>

/** Bookings that still count against a discount code's limits. */
const REDEEMING_STATUSES: BookingRecordStatus[] = [
  "awaiting_venue_confirmation",
  "pending",
  "confirmed",
  "checked-in",
  "completed",
]

/**
 * The player's side of a VietQR payment: show where to transfer, sign the
 * screenshot upload, record the proof. The venue — not this service — decides
 * whether the money arrived (`BookingsService#decide`), and no money passes
 * through the platform. The booking's state machine stays in `BookingsService`.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(PayoutService) private readonly payouts: PayoutService,
    @Inject(ProofUploadService) private readonly proofs: ProofUploadService,
    @Inject(DiscountsService) private readonly discounts: DiscountsService,
    @Inject(ProfileService) private readonly profiles: ProfileService
  ) {}

  private async ownBooking(
    userId: string,
    bookingId: string
  ): Promise<StartableBooking> {
    const booking = await this.bookingModel
      .findOne({ bookingId })
      .select(
        "venueId userId status price amountDue transferMemo payoutSnapshot discountCode discountAmount originalAmount"
      )
      .lean<StartableBooking>()
    if (!booking) throw new NotFoundException("Booking not found")
    if (booking.userId !== userId) {
      throw new ForbiddenException("This booking belongs to another account")
    }
    return booking
  }

  /**
   * Start (or resume) paying for the caller's own `awaiting_payment` booking —
   * `POST /api/bookings/:id/payment/start`. The first call fixes the amount
   * (100% of the price, minus a valid discount code), a unique transfer memo
   * and a snapshot of the venue's account; calling again returns the same
   * thing, so a venue changing its account mid-payment cannot misdirect it.
   */
  async startPayment(
    userId: string,
    bookingId: string,
    discountCode?: string
  ): Promise<PaymentStart> {
    const booking = await this.ownBooking(userId, bookingId)
    if (booking.status !== "awaiting_payment") {
      throw new ConflictException(
        `Không thể thanh toán lượt đặt ở trạng thái "${booking.status}"`
      )
    }
    const refundAccount = await this.profiles.getRefundAccount(userId)

    if (booking.transferMemo && booking.payoutSnapshot) {
      return this.toStart(
        bookingId,
        booking,
        booking.payoutSnapshot,
        refundAccount
      )
    }

    const account = await this.payouts.payoutForVenue(booking.venueId)
    if (!account) {
      throw new ConflictException(
        "Sân này chưa khai báo tài khoản nhận tiền nên chưa nhận đặt trực tuyến"
      )
    }
    const discount = discountCode
      ? await this.discounts.validate(discountCode, booking.price)
      : null
    if (discount) await this.assertRedemptionQuota(discount, userId, bookingId)
    const amountDue = discount ? discount.finalAmount : booking.price

    for (let attempt = 0; attempt < 5; attempt++) {
      const memo = generateTransferMemo()
      try {
        const updated = await this.bookingModel
          .findOneAndUpdate(
            {
              bookingId,
              status: "awaiting_payment",
              transferMemo: { $exists: false },
            },
            {
              $set: {
                transferMemo: memo,
                amountDue,
                payoutSnapshot: account,
                paymentMethod: "vietqr",
                ...(discount
                  ? {
                      originalAmount: booking.price,
                      discountCode: discount.code,
                      discountAmount: discount.discountAmount,
                    }
                  : {}),
              },
            },
            { new: true }
          )
          .lean<StartableBooking>()
        if (updated?.transferMemo && updated.payoutSnapshot) {
          return this.toStart(
            bookingId,
            updated,
            updated.payoutSnapshot,
            refundAccount
          )
        }
        // A concurrent call won: serve what it stored.
        const current = await this.ownBooking(userId, bookingId)
        if (current.transferMemo && current.payoutSnapshot) {
          return this.toStart(
            bookingId,
            current,
            current.payoutSnapshot,
            refundAccount
          )
        }
        throw new ConflictException("Lượt đặt này không còn chờ thanh toán")
      } catch (err) {
        if (isDuplicateKeyError(err)) continue
        throw err
      }
    }
    throw new ConflictException(
      "Không tạo được mã chuyển khoản — vui lòng thử lại"
    )
  }

  private toStart(
    bookingId: string,
    booking: StartableBooking,
    account: BankAccount,
    refundAccount: BankAccount | null
  ): PaymentStart {
    const amount = booking.amountDue ?? booking.price
    const memo = booking.transferMemo ?? ""
    return {
      bookingId,
      amount,
      originalAmount: booking.originalAmount ?? booking.price,
      ...(booking.discountCode
        ? {
            discountCode: booking.discountCode,
            discountAmount: booking.discountAmount,
          }
        : {}),
      transferMemo: memo,
      qrUrl: buildVietQrImageUrl({ account, amount, memo }),
      account,
      refundAccount,
    }
  }

  /**
   * A discount code's caps, checked before the amount is quoted. Redemptions
   * are counted from bookings (those whose transfer was reported), so a hold
   * that never went anywhere doesn't burn one. The current booking is excluded.
   */
  private async assertRedemptionQuota(
    discount: { code: string; usageLimit?: number; perUserLimit?: number },
    userId: string,
    bookingId: string
  ): Promise<void> {
    const redeemed = {
      discountCode: discount.code,
      status: { $in: REDEEMING_STATUSES },
      bookingId: { $ne: bookingId },
    }
    if (typeof discount.perUserLimit === "number") {
      const mine = await this.bookingModel.countDocuments({
        ...redeemed,
        userId,
      })
      if (mine >= discount.perUserLimit) {
        throw new ConflictException(
          "Bạn đã dùng mã giảm giá này tối đa số lần cho phép"
        )
      }
    }
    if (typeof discount.usageLimit === "number") {
      const total = await this.bookingModel.countDocuments(redeemed)
      if (total >= discount.usageLimit) {
        throw new ConflictException("Mã giảm giá đã hết lượt sử dụng")
      }
    }
  }

  /** A signature for uploading the transfer screenshot (`POST …/payment/proof/signature`). */
  async signProofUpload(
    userId: string,
    bookingId: string
  ): Promise<VenuePhotoUploadSignature> {
    const booking = await this.ownBooking(userId, bookingId)
    if (booking.status !== "awaiting_payment") {
      throw new ConflictException("Lượt đặt này không còn chờ thanh toán")
    }
    return this.proofs.sign(booking.venueId)
  }

  /**
   * The player sends the screenshot (`POST …/payment/submit`): the booking
   * waits for the venue, and the player's refund account is remembered.
   */
  async submitProof(
    userId: string,
    bookingId: string,
    input: { proofUrl: string; refundAccount: PayoutDto }
  ): Promise<BookingSummary> {
    const booking = await this.ownBooking(userId, bookingId)
    this.proofs.assertProofUrl(input.proofUrl, booking.venueId)
    const refundAccount = await this.payouts.toAccount(input.refundAccount)
    const summary = await this.bookings.submitPaymentProof(userId, bookingId, {
      proofUrl: input.proofUrl,
      refundAccount,
    })
    await this.profiles
      .setRefundAccount(userId, refundAccount)
      .catch((err: unknown) => {
        this.logger.warn(`Failed to save refund account: ${String(err)}`)
      })
    if (booking.status === "awaiting_payment" && booking.discountCode) {
      await this.discounts
        .applyUsage(booking.discountCode)
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to record discount usage for booking ${bookingId}: ${String(err)}`
          )
        })
    }
    return summary
  }

  /** A signature for the venue's refund screenshot (`POST …/refund/signature`). */
  async signRefundUpload(
    callerId: string,
    bookingId: string
  ): Promise<VenuePhotoUploadSignature> {
    const venueId = await this.bookings.assertOwnsBookingVenue(
      callerId,
      bookingId
    )
    return this.proofs.sign(venueId)
  }

  /** The venue sends the refund screenshot (`POST …/refund/complete`). */
  async completeRefund(
    callerId: string,
    bookingId: string,
    input: { proofUrl: string; amount?: number }
  ): Promise<BookingSummary> {
    const venueId = await this.bookings.assertOwnsBookingVenue(
      callerId,
      bookingId
    )
    this.proofs.assertProofUrl(input.proofUrl, venueId)
    return this.bookings.completeRefund(callerId, bookingId, input)
  }
}
