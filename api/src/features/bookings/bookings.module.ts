import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { NotificationsModule } from "../notifications/notifications.module.js"
import { PlayersModule } from "../players/players.module.js"
import { Venue, VenueSchema } from "../venues/venue.schema.js"
import { BookingLock, BookingLockSchema } from "./booking-lock.schema.js"
import { Booking, BookingSchema } from "./booking.schema.js"
import { BookingsController } from "./bookings.controller.js"
import { BookingsService } from "./bookings.service.js"

// The canonical booking store. Registers the `Venue` schema too (not just
// `Booking`/`BookingLock`) so BookingsService can read/write the venue's court
// catalog and CRM customers directly — the same collection VenuesModule
// registers, so this is one shared Mongoose model, not a duplicate. That lets
// VenuesModule and SessionsModule both depend on BookingsModule (one
// direction each) without either depending on the other's *service*, which is
// what dissolves the old Sessions↔Venues forwardRef cycle. PlayersModule
// gives BookingsService the customer-name lookup (`createHold`); both
// PlayersModule and NotificationsModule have no feature-module deps of their
// own, so this stays one-directional too. NotificationsModule backs the
// booking-decision/auto-confirm/no-show notification producers
// (`decide`/`sweep`/`markNoShow` — VienTD-Review Phase 7).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: BookingLock.name, schema: BookingLockSchema },
      { name: Venue.name, schema: VenueSchema },
    ]),
    PlayersModule,
    NotificationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
