import { Module } from "@nestjs/common"

import { AssessmentModule } from "../assessment/assessment.module.js"
import { PlayersModule } from "../players/players.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { AccountController } from "./account.controller.js"
import { AccountService } from "./account.service.js"

@Module({
  imports: [PlayersModule, AssessmentModule, VenuesModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
