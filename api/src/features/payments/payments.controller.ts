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
import { BookingIdParamDto, CheckoutDto } from "./payments.dto.js"
import { PaymentsService } from "./payments.service.js"

// SePay checkout + IPN (VienTD-Review Phase 4). `checkout`/`byBooking` are
// player-facing and go through the global ClerkAuthGuard like every other
// route; `ipn` is SePay's server calling us, so it's `@Public()` and
// authenticates itself instead via the request's HMAC signature
// (`PaymentsService#handleIpn` → `SepayClient#verifyIpnSignature`).
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Start (or resume) a SePay checkout for the caller's own booking hold. */
  @Post("checkout")
  async checkout(@UserId() userId: string, @Body() body: CheckoutDto) {
    return this.payments.checkout(userId, body.bookingId)
  }

  /**
   * SePay's server-to-server payment notification. Reads the *raw* request
   * body (`req.rawBody`, populated by `main.ts`'s `rawBody: true` app option)
   * because the HMAC signature is computed over the exact bytes SePay sent —
   * re-serializing the parsed JSON would silently break verification on any
   * whitespace/key-order difference.
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
