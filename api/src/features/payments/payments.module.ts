import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BookingsModule } from "../bookings/bookings.module.js"
import { Booking, BookingSchema } from "../bookings/booking.schema.js"
import { BrandsModule } from "../brands/brands.module.js"
import { DiscountsModule } from "../discounts/discounts.module.js"
import { PlayersModule } from "../players/players.module.js"
import { BookingsSweeperService } from "./bookings-sweeper.service.js"
import { PaymentsController } from "./payments.controller.js"
import { PaymentsService } from "./payments.service.js"
import { ProofUploadService } from "./proof-upload.service.js"

// The VietQR payment steps (plan 025): players pay the venue by bank transfer
// and upload a screenshot, the venue approves or refunds by hand. No gateway,
// no webhook — `BookingsService` owns the state machine, this module the QR /
// upload plumbing. Registers `Booking` directly (like `BookingsModule` does for
// `Venue`) so `PaymentsService` can read a booking without another dependency.
//
// Also hosts the booking sweeper (`BookingsSweeperService`), which only needs
// `BookingsService`; keeping it here avoids a one-class module.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    BookingsModule,
    // The venue's account and the player's refund account.
    BrandsModule,
    // Re-validates a discount code server-side and records its use.
    DiscountsModule,
    // The player's saved refund account lives on their profile.
    PlayersModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, ProofUploadService, BookingsSweeperService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
