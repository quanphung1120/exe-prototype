import { Module } from "@nestjs/common"

import { AssessmentModule } from "../assessment/assessment.module.js"
import { CourtsModule } from "../courts/courts.module.js"
import { PlayersModule } from "../players/players.module.js"
import { SessionsModule } from "../sessions/sessions.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { SeedController } from "./seed.controller.js"
import { SeedService } from "./seed.service.js"

// The seed aggregate composes every feature service, so it imports those modules
// (each exports its service) and injects them into SeedService.
@Module({
  imports: [
    CourtsModule,
    PlayersModule,
    SessionsModule,
    VenuesModule,
    AssessmentModule,
  ],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
