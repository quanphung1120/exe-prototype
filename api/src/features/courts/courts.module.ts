import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Court, CourtSchema } from "./court.schema.js"
import { CourtsController } from "./courts.controller.js"
import { CourtsService } from "./courts.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Court.name, schema: CourtSchema }]),
  ],
  controllers: [CourtsController],
  providers: [CourtsService],
  exports: [CourtsService],
})
export class CourtsModule {}
