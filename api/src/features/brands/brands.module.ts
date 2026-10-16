import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BanksModule } from "../banks/banks.module.js"
import { Brand, BrandSchema } from "./brand.schema.js"
import { BrandsService } from "./brands.service.js"
import { PayoutController } from "./payout.controller.js"
import { PayoutService } from "./payout.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Brand.name, schema: BrandSchema }]),
    BanksModule,
  ],
  controllers: [PayoutController],
  providers: [BrandsService, PayoutService],
  exports: [BrandsService, PayoutService],
})
export class BrandsModule {}
