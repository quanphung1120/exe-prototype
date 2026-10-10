import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Booking, BookingSchema } from "../bookings/booking.schema.js"
import { BookingsModule } from "../bookings/bookings.module.js"
import { NotificationsModule } from "../notifications/notifications.module.js"
import { PlayersModule } from "../players/players.module.js"
import { PlaySession, PlaySessionSchema } from "../sessions/session.schema.js"
import { StreamModule } from "../stream/stream.module.js"
import { WalletModule } from "../wallet/wallet.module.js"
import { RoomEventsModule } from "./room-events.module.js"
import { RoomComplaint, RoomComplaintSchema } from "./room-complaint.schema.js"
import { RoomShare, RoomShareSchema } from "./room-share.schema.js"
import { RoomsController } from "./rooms.controller.js"
import { RoomsService } from "./rooms.service.js"

// Cross-user room coordination (VienTD-Review Phase 9 G2). Registers the
// `PlaySession` schema again under its own model token — the same pattern
// `BookingsModule`/`VenuesModule` already use for the shared `Venue` schema
// — so `RoomsService` can query/mutate *any* user's room doc directly,
// unlike the owner-scoped model `SessionsModule` wires up for
// `SessionsService`. `PlayersModule` gives it the requester's real
// name/initials (`ProfileService`, never trusted from the request body);
// `NotificationsModule` and `StreamModule` back the join/approve/decline
// notify + real-chat-membership side effects.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlaySession.name, schema: PlaySessionSchema },
      // Read-only: a booked room's price/payment state sets each seat's share.
      { name: Booking.name, schema: BookingSchema },
      { name: RoomShare.name, schema: RoomShareSchema },
      { name: RoomComplaint.name, schema: RoomComplaintSchema },
    ]),
    PlayersModule,
    NotificationsModule,
    StreamModule,
    RoomEventsModule,
    // Members' shares move between wallets.
    WalletModule,
    // Overturning a wrongly refused cancel goes through the booking.
    BookingsModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
