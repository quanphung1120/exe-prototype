import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { DiscountCode, DiscountCodeSchema } from "./discount-code.schema.js"
import { DiscountsController } from "./discounts.controller.js"
import { DiscountsService } from "./discounts.service.js"

// Mã giảm giá (discount code) validation, consumed directly by `POST
// /api/discounts/validate` and, server-side, by `PaymentsModule` (which
// imports this module to re-validate a code before charging SePay and to
// increment `usedCount` once a payment is confirmed paid).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiscountCode.name, schema: DiscountCodeSchema },
    ]),
  ],
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
