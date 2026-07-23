import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { BookingsModule } from "../bookings/bookings.module.js"
import { PlaySession, PlaySessionSchema } from "./session.schema.js"
import { SessionsController } from "./sessions.controller.js"
import { SessionsService } from "./sessions.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlaySession.name, schema: PlaySessionSchema },
    ]),
    // The booking→session cross-write and status derivation both go through
    // BookingsService (the canonical `bookings` collection).
    BookingsModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
