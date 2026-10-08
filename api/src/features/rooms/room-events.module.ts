import { Module } from "@nestjs/common"

import { RoomEventsService } from "./room-events.service.js"

// Its own module (not part of RoomsModule) so SessionsModule can announce a
// host's own room writes without importing all of RoomsModule.
@Module({
  providers: [RoomEventsService],
  exports: [RoomEventsService],
})
export class RoomEventsModule {}
