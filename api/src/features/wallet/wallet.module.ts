import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { NotificationsModule } from "../notifications/notifications.module.js"
import { WalletController } from "./wallet.controller.js"
import { Withdrawal, WithdrawalSchema } from "./withdrawal.schema.js"
import { WithdrawalsController } from "./withdrawals.controller.js"
import { WithdrawalsService } from "./withdrawals.service.js"
import {
  Wallet,
  WalletSchema,
  WalletTx,
  WalletTxSchema,
} from "./wallet.schema.js"
import { WalletService } from "./wallet.service.js"

// A leaf module (like `NotificationsModule`) so `BookingsModule` (refunds) and
// `PaymentsModule` (top-ups, paying with the wallet) can both import it
// without a cycle.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: WalletTx.name, schema: WalletTxSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [WalletController, WithdrawalsController],
  providers: [WalletService, WithdrawalsService],
  exports: [WalletService, WithdrawalsService],
})
export class WalletModule {}
