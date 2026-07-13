import { Module } from "@nestjs/common"

import { VenuesModule } from "../venues/venues.module.js"
import { CourtsController } from "./courts.controller.js"
import { CourtsService } from "./courts.service.js"

// Courts are now a projection of the venue catalog (VenuesService), so this
// module no longer owns a Mongoose model — it just imports VenuesModule.
@Module({
  imports: [VenuesModule],
  controllers: [CourtsController],
  providers: [CourtsService],
  exports: [CourtsService],
})
export class CourtsModule {}
