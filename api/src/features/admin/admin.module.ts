import { Module } from "@nestjs/common"

import { BookingsModule } from "../bookings/bookings.module.js"
import { BrandsModule } from "../brands/brands.module.js"
import { PlayersModule } from "../players/players.module.js"
import { SessionsModule } from "../sessions/sessions.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { AdminController } from "./admin.controller.js"
import { AdminService } from "./admin.service.js"

// Every cross-tenant read/write composes the existing feature services'
// unscoped methods — no new schema registrations of its own.
@Module({
  imports: [
    VenuesModule,
    BrandsModule,
    BookingsModule,
    PlayersModule,
    SessionsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
