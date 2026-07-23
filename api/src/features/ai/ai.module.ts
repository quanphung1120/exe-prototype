import { Module } from "@nestjs/common"

import { SeedModule } from "../seed/seed.module.js"
import { AiController } from "./ai.controller.js"
import { AiService } from "./ai.service.js"

@Module({
  imports: [SeedModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
