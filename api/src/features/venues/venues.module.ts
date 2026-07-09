import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Venue, VenueSchema } from "./venue.schema.js"
import { VenueController } from "./venue.controller.js"
import { VenuesController } from "./venues.controller.js"
import { VenuesService } from "./venues.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Venue.name, schema: VenueSchema }]),
  ],
  controllers: [VenuesController, VenueController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
