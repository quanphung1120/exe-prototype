import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Brand, BrandSchema } from "./brand.schema.js"
import { BrandsService } from "./brands.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Brand.name, schema: BrandSchema }]),
  ],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
