import { Body, Controller, Get, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { TopUpDto, TopUpIdParamDto } from "./payments.dto.js"
import { TopUpsService } from "./topups.service.js"

// Wallet top-ups, under /api/wallet/topups. Lives in `PaymentsModule` (not
// `WalletModule`) because it needs the SePay client bound there; the balance
// and ledger themselves are `WalletController`'s.
@Controller("wallet/topups")
export class TopUpsController {
  constructor(private readonly topUps: TopUpsService) {}

  /** Open a SePay checkout for a top-up. Per-user throttled — it creates an external order. */
  @UserThrottle({ limit: 10, ttl: 60_000 })
  @Post()
  create(@UserId() userId: string, @Body() body: TopUpDto) {
    return this.topUps.create(userId, body.amount)
  }

  /** Polled on return from SePay. */
  @Get(":id")
  byId(@UserId() userId: string, @Param() param: TopUpIdParamDto) {
    return this.topUps.byId(userId, param.id)
  }
}
