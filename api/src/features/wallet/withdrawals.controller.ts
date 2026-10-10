import { Body, Controller, Get, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { WithdrawDto } from "./wallet.dto.js"
import { WithdrawalsService } from "./withdrawals.service.js"

// The signed-in player's own withdrawal requests, under /api/wallet/withdrawals.
@Controller("wallet/withdrawals")
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  /** Take money out of the wallet; an admin sends the bank transfer by hand. */
  @UserThrottle({ limit: 5, ttl: 60_000 })
  @Post()
  create(@UserId() userId: string, @Body() body: WithdrawDto) {
    return this.withdrawals.create(userId, body)
  }

  @Get()
  list(@UserId() userId: string) {
    return this.withdrawals.listMine(userId)
  }
}
