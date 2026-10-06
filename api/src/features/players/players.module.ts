import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Player, PlayerSchema } from "./player.schema.js"
import { Profile, ProfileSchema } from "./profile.schema.js"
import { PlayerService } from "./player.service.js"
import { ProfileService } from "./profile.service.js"
import { PlayersController } from "./players.controller.js"
import { StreamModule } from "../stream/stream.module.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
    // Clerk directory: a new profile starts from the account's real name.
    StreamModule,
  ],
  controllers: [PlayersController],
  providers: [PlayerService, ProfileService],
  exports: [PlayerService, ProfileService],
})
export class PlayersModule {}
