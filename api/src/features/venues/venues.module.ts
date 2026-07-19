import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BookingsModule } from "../bookings/bookings.module.js"
import { PlayersModule } from "../players/players.module.js"
import { StreamModule } from "../stream/stream.module.js"
import { Venue, VenueSchema } from "./venue.schema.js"
import { VenueController } from "./venue.controller.js"
import { VenuesController } from "./venues.controller.js"
import { VenuesService } from "./venues.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Venue.name, schema: VenueSchema }]),
    // Reservation/walk-in/reschedule mutations delegate to BookingsService
    // (the canonical `bookings` collection). PlayersModule gives the
    // decision-notification service.
    BookingsModule,
    PlayersModule,
    // StreamModule: cancel/decline freezes the room's chat (best-effort hook).
    StreamModule,
  ],
  controllers: [VenuesController, VenueController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
