import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Player, PlayerSchema } from "./player.schema.js"
import { Profile, ProfileSchema } from "./profile.schema.js"
import { PlayerService } from "./player.service.js"
import { ProfileService } from "./profile.service.js"
import { PlayersController } from "./players.controller.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [PlayersController],
  providers: [PlayerService, ProfileService],
  exports: [PlayerService, ProfileService],
})
export class PlayersModule {}
