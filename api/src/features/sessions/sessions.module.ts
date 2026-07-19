import { forwardRef, Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { VenuesModule } from "../venues/venues.module.js"
import { PlaySession, PlaySessionSchema } from "./session.schema.js"
import { SessionsController } from "./sessions.controller.js"
import { SessionsService } from "./sessions.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlaySession.name, schema: PlaySessionSchema },
    ]),
    // forwardRef: Venues ↔ Sessions cross-write each other (see VenuesModule).
    forwardRef(() => VenuesModule),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
