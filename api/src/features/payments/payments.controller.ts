import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common"
import type { Request } from "express"

import { Public } from "../../common/public.decorator.js"
import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { BookingIdParamDto, CheckoutDto } from "./payments.dto.js"
import { PaymentsService } from "./payments.service.js"

// SePay checkout + IPN (VienTD-Review Phase 4). `checkout`/`byBooking` are
// player-facing and go through the global ClerkAuthGuard like every other
// route; `ipn` is SePay's server calling us, so it's `@Public()` and
// authenticates itself instead via the request's `X-Secret-Key` header
// (`PaymentsService#handleIpn` → `SepayClient#verifyIpnAuth`).
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Start (or resume) a SePay checkout for the caller's own booking hold.
   * Per-user throttled — each call creates an external SePay checkout.
   */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post("checkout")
  async checkout(@UserId() userId: string, @Body() body: CheckoutDto) {
    return this.payments.checkout(userId, body.bookingId, body.discountCode)
  }

  /**
   * SePay's server-to-server payment notification. Reads the *raw* request
   * body (`req.rawBody`, populated by `main.ts`'s `rawBody: true` app option)
   * and lets `handleIpn` parse it itself — SePay's payload shape is theirs,
   * not ours, so it skips the DTO/ValidationPipe layer.
   */
  @Public()
  @Post("ipn")
  async ipn(@Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) {
      throw new BadRequestException("Missing request body")
    }
    return this.payments.handleIpn(req.rawBody, req.headers)
  }

  /** The caller polls this while on the SePay checkout/return screen. */
  @Get("by-booking/:id")
  async byBooking(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.payments.byBooking(userId, param.id)
  }
}
