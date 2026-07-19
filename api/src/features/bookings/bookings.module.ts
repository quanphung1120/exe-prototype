import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Venue, VenueSchema } from "../venues/venue.schema.js"
import { BookingLock, BookingLockSchema } from "./booking-lock.schema.js"
import { Booking, BookingSchema } from "./booking.schema.js"
import { BookingsService } from "./bookings.service.js"

// The canonical booking store. Registers the `Venue` schema too (not just
// `Booking`/`BookingLock`) so BookingsService can read/write the venue's court
// catalog and CRM customers directly — the same collection VenuesModule
// registers, so this is one shared Mongoose model, not a duplicate. That lets
// VenuesModule and SessionsModule both depend on BookingsModule (one
// direction each) without either depending on the other's *service*, which is
// what dissolves the old Sessions↔Venues forwardRef cycle.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: BookingLock.name, schema: BookingLockSchema },
      { name: Venue.name, schema: VenueSchema },
    ]),
  ],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
