import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BookingsModule } from "../bookings/bookings.module.js"
import { Booking, BookingSchema } from "../bookings/booking.schema.js"
import { PlayersModule } from "../players/players.module.js"
import { Venue, VenueSchema } from "../venues/venue.schema.js"
import { BookingsSweeperService } from "./bookings-sweeper.service.js"
import { Payment, PaymentSchema } from "./payment.schema.js"
import { PaymentsController } from "./payments.controller.js"
import { PaymentsService } from "./payments.service.js"
import { SEPAY_CLIENT, SepayClient } from "./sepay.client.js"

// SePay checkout + IPN (VienTD-Review Phase 4). Registers `Booking`/`Venue`
// too (not just `Payment`) — same pattern `BookingsModule` uses for `Venue` —
// so `PaymentsService` can read a booking's price/owner and flip a venue
// owner's notification feed directly, without a new cross-service dependency
// beyond `BookingsModule` (for `BookingsService#confirmPayment`, the only
// place the booking-side state machine is touched) and `PlayersModule` (for
// `ProfileService#addNotification`). `SEPAY_CLIENT` binds the real
// `sepay-pg-node`-backed client here; tests override this provider with a
// fake so nothing hits the network.
//
// Also hosts the Phase 5 booking sweeper (`BookingsSweeperService`): it needs
// both `BookingsService` (already imported here via `BookingsModule`) and
// `PaymentsService` (this module's own provider) to expire unpaid holds via
// the real gateway — putting it here avoids a `BookingsModule` ↔
// `PaymentsModule` cycle that giving it its own module importing both would
// create (`PaymentsModule` already depends on `BookingsModule`, one direction
// only).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Venue.name, schema: VenueSchema },
    ]),
    BookingsModule,
    PlayersModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: SEPAY_CLIENT, useClass: SepayClient },
    BookingsSweeperService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
