import { Body, Controller, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { BookingsService } from "../bookings/bookings.service.js"
import {
  BookingIdParamDto,
  CompleteRefundDto,
  ConfirmRefundDto,
  StartPaymentDto,
  SubmitPaymentProofDto,
} from "./payments.dto.js"
import { PaymentsService } from "./payments.service.js"

// The payment steps of a booking, under /api/bookings/:id. The player pays the
// venue directly by bank transfer (VietQR) and sends a screenshot; the venue
// approves or rejects and refunds by hand — see `BookingsService` for the state
// machine. Every write that signs an upload or stores an image is throttled.
@Controller("bookings")
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly bookings: BookingsService
  ) {}

  /** Where and how much to transfer, with the memo to put in the transfer. */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post(":id/payment/start")
  start(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: StartPaymentDto
  ) {
    return this.payments.startPayment(userId, param.id, body.discountCode)
  }

  /** A signature to upload the transfer screenshot straight to Cloudinary. */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post(":id/payment/proof/signature")
  proofSignature(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.payments.signProofUpload(userId, param.id)
  }

  /** The player sends the screenshot; the booking now waits for the venue. */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post(":id/payment/submit")
  submit(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: SubmitPaymentProofDto
  ) {
    return this.payments.submitProof(userId, param.id, body)
  }

  /** A signature for the venue's refund screenshot. */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post(":id/refund/signature")
  refundSignature(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.payments.signRefundUpload(userId, param.id)
  }

  /** The venue sends the refund screenshot; the booking becomes refunded. */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post(":id/refund/complete")
  completeRefund(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: CompleteRefundDto
  ) {
    return this.payments.completeRefund(userId, param.id, body)
  }

  /** The player says whether the refund arrived ("not received" opens a complaint). */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post(":id/refund/confirm")
  confirmRefund(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: ConfirmRefundDto
  ) {
    return this.bookings.confirmRefundReceipt(userId, param.id, body.result)
  }
}
