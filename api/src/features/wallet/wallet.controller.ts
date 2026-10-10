import { Controller, Get } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { WalletService } from "./wallet.service.js"

// The signed-in player's own wallet. Top-ups (which need SePay) live in
// `payments/topups.controller.ts`; this feature only owns balance + ledger.
@Controller("wallet")
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  summary(@UserId() userId: string) {
    return this.wallet.getSummary(userId)
  }
}
