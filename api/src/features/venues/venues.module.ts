import { forwardRef, Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { PlayersModule } from "../players/players.module.js"
import { SessionsModule } from "../sessions/sessions.module.js"
import { Venue, VenueSchema } from "./venue.schema.js"
import { VenueController } from "./venue.controller.js"
import { VenuesController } from "./venues.controller.js"
import { VenuesService } from "./venues.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Venue.name, schema: VenueSchema }]),
    // forwardRef: Sessions ↔ Venues cross-write each other (booking → reservation,
    // decision → session). PlayersModule gives the decline-notification service.
    forwardRef(() => SessionsModule),
    PlayersModule,
  ],
  controllers: [VenuesController, VenueController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
