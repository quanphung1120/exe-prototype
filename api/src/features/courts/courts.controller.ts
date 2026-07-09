import { Controller, Get, Param, Query } from "@nestjs/common"
import * as z from "zod"

import { ZodValidationPipe } from "../../common/zod-validation.pipe.js"
import { CourtsService } from "./courts.service.js"

const sportEnum = z.enum(["pickleball", "badminton"])
const listCourtsQuery = z.object({ sport: sportEnum.optional() })
const courtParam = z.object({ id: z.string().min(1) })

// Court-finder read endpoints (mounted at /api/courts via the global prefix).
@Controller("courts")
export class CourtsController {
  constructor(private readonly courts: CourtsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listCourtsQuery))
    query: z.infer<typeof listCourtsQuery>
  ) {
    const data = await this.courts.listCourts(query.sport)
    return { data, filter: { sport: query.sport ?? null } }
  }

  @Get(":id")
  get(
    @Param(new ZodValidationPipe(courtParam)) param: z.infer<typeof courtParam>
  ) {
    return this.courts.getCourt(param.id)
  }
}
