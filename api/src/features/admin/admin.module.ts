import { Module } from "@nestjs/common"

import { BookingsModule } from "../bookings/bookings.module.js"
import { BrandsModule } from "../brands/brands.module.js"
import { DiscountsModule } from "../discounts/discounts.module.js"
import { PlayersModule } from "../players/players.module.js"
import { RoomsModule } from "../rooms/rooms.module.js"
import { WalletModule } from "../wallet/wallet.module.js"
import { SessionsModule } from "../sessions/sessions.module.js"
import { StreamModule } from "../stream/stream.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { AdminController } from "./admin.controller.js"
import { AdminService } from "./admin.service.js"
import { OwnerRemovalService } from "./owner-removal.service.js"

// Every cross-tenant read/write composes the existing feature services'
// unscoped methods — no new schema registrations of its own.
@Module({
  imports: [
    VenuesModule,
    BrandsModule,
    BookingsModule,
    PlayersModule,
    SessionsModule,
    DiscountsModule,
    RoomsModule,
    WalletModule,
    StreamModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, OwnerRemovalService],
})
export class AdminModule {}
