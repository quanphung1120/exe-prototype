import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BanksModule } from "../banks/banks.module.js"
import { Venue, VenueSchema } from "../venues/venue.schema.js"
import { Brand, BrandSchema } from "./brand.schema.js"
import { BrandsService } from "./brands.service.js"
import { PayoutController } from "./payout.controller.js"
import { PayoutService } from "./payout.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Brand.name, schema: BrandSchema },
      // Read-only: resolves a venue to its brand's payout account.
      { name: Venue.name, schema: VenueSchema },
    ]),
    BanksModule,
  ],
  controllers: [PayoutController],
  providers: [BrandsService, PayoutService],
  exports: [BrandsService, PayoutService],
})
export class BrandsModule {}
