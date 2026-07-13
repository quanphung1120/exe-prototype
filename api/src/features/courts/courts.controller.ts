import { Controller, Get, Param, Query } from "@nestjs/common"

import { CourtParamDto, ListCourtsQueryDto } from "./courts.dto.js"
import { CourtsService } from "./courts.service.js"

// Court-finder read endpoints (mounted at /api/courts via the global prefix).
@Controller("courts")
export class CourtsController {
  constructor(private readonly courts: CourtsService) {}

  @Get()
  async list(@Query() query: ListCourtsQueryDto) {
    const data = await this.courts.listCourts(query.sport)
    return { data, filter: { sport: query.sport ?? null } }
  }

  @Get(":id")
  get(@Param() param: CourtParamDto) {
    return this.courts.getCourt(param.id)
  }
}
