import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import {
  PlayerAssessment,
  PlayerAssessmentSchema,
} from "./assessment.schema.js"
import { AssessmentController } from "./assessment.controller.js"
import { AssessmentService } from "./assessment.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlayerAssessment.name, schema: PlayerAssessmentSchema },
    ]),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
