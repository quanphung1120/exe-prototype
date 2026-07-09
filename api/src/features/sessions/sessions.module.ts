import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { PlaySession, PlaySessionSchema } from "./session.schema.js"
import { SessionsController } from "./sessions.controller.js"
import { SessionsService } from "./sessions.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlaySession.name, schema: PlaySessionSchema },
    ]),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
