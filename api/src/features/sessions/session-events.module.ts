import { Module } from "@nestjs/common"

import { SessionEventsService } from "./session-events.service.js"

@Module({
  providers: [SessionEventsService],
  exports: [SessionEventsService],
})
export class SessionEventsModule {}
