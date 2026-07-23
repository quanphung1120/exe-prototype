import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BookingsModule } from "../bookings/bookings.module.js"
import { BrandsModule } from "../brands/brands.module.js"
import { NotificationsModule } from "../notifications/notifications.module.js"
import { PlayersModule } from "../players/players.module.js"
import { StreamModule } from "../stream/stream.module.js"
import { Venue, VenueSchema } from "./venue.schema.js"
import { VenuesController } from "./venues.controller.js"
import { VenuesService } from "./venues.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Venue.name, schema: VenueSchema }]),
    // Reservation/walk-in/reschedule mutations delegate to BookingsService
    // (the canonical `bookings` collection). PlayersModule seeds the account's
    // profile on venue provisioning; NotificationsModule backs the operator
    // decision → player notification (VienTD-Review Phase 7).
    BookingsModule,
    // BrandsModule: provisioning a venue also ensures the account's brand
    // (the parent of its venue branches) — see VenuesService.provisionVenue.
    BrandsModule,
    PlayersModule,
    NotificationsModule,
    // StreamModule: cancel/decline freezes the room's chat (best-effort hook).
    StreamModule,
  ],
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
