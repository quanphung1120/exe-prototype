import { Body, Controller, Get, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { PayoutDto } from "./payout.dto.js"
import { PayoutService } from "./payout.service.js"

// The owner's payout account, under /api/brands/me/payout.
@Controller("brands/me/payout")
export class PayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get()
  async get(@UserId() userId: string) {
    return { payout: await this.payouts.getPayout(userId) }
  }

  @Put()
  async set(@UserId() userId: string, @Body() body: PayoutDto) {
    return { payout: await this.payouts.setPayout(userId, body) }
  }
}
