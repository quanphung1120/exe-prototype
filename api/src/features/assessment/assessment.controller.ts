import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Res,
} from "@nestjs/common"
import type { Response } from "express"

import type { PlayerAssessment as PlayerAssessmentData } from "../../shared/index.js"

import { UserId } from "../../common/user-id.decorator.js"
import { AssessmentService } from "./assessment.service.js"

// A player's skills assessment (per Clerk user). A single per-user resource (no
// id in the path) — GET reads it (null until taken), PUT upserts it. Like
// sessions, the full shape is owned by the web client, so the PUT body is read
// directly and structurally checked rather than run through a stripping schema.
@Controller("assessment")
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get()
  async get(@UserId() userId: string, @Res() res: Response) {
    // Serialize explicitly so an untaken assessment sends a literal `null` body
    // (the web's fetchAssessment does `res.json()`, which an empty body breaks).
    res.json(await this.assessment.getUserAssessment(userId))
  }

  @Put()
  put(@UserId() userId: string, @Body() body: PlayerAssessmentData) {
    if (
      !body ||
      typeof body !== "object" ||
      body.version !== 1 ||
      !Array.isArray(body.selectedSports) ||
      typeof body.results !== "object" ||
      body.results === null
    ) {
      throw new BadRequestException("Invalid assessment payload")
    }
    return this.assessment.saveUserAssessment(userId, body)
  }
}
