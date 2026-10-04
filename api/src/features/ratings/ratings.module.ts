import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { NotificationsModule } from "../notifications/notifications.module.js"
import { PlayersModule } from "../players/players.module.js"
import { PlaySession, PlaySessionSchema } from "../sessions/session.schema.js"
import { Rating, RatingSchema } from "./rating.schema.js"
import { RatingsController } from "./ratings.controller.js"
import { RatingsService } from "./ratings.service.js"

// Peer ratings after a played match. Registers `PlaySession` under its own
// model token (the `RoomsModule` pattern) to read any host's session when
// checking who played; `PlayersModule` supplies the rater's display name and
// `NotificationsModule` tells the ratee they were reviewed.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rating.name, schema: RatingSchema },
      { name: PlaySession.name, schema: PlaySessionSchema },
    ]),
    PlayersModule,
    NotificationsModule,
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
})
export class RatingsModule {}
