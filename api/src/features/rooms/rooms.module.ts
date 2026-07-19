import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { NotificationsModule } from "../notifications/notifications.module.js"
import { PlayersModule } from "../players/players.module.js"
import { PlaySession, PlaySessionSchema } from "../sessions/session.schema.js"
import { StreamModule } from "../stream/stream.module.js"
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
    ]),
    PlayersModule,
    NotificationsModule,
    StreamModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
