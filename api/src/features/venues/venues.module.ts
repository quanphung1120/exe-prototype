import { forwardRef, Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { PaymentsModule } from "../payments/payments.module.js"
import { PlayersModule } from "../players/players.module.js"
import { SessionsModule } from "../sessions/sessions.module.js"
import { BookingsSweeperService } from "./bookings.sweeper.js"
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
    // The injectable SePay client the sweeper's expire-hold rule calls to
    // cancel an unpaid gateway order (Phase 5).
    PaymentsModule,
  ],
  controllers: [VenuesController, VenueController],
  providers: [VenuesService, BookingsSweeperService],
  exports: [VenuesService],
})
export class VenuesModule {}
