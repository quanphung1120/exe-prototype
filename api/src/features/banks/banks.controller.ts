import { Controller, Get } from "@nestjs/common"

import { BanksService } from "./banks.service.js"

// The bank picker's data, under /api/banks (any signed-in user).
@Controller("banks")
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  list() {
    return this.banks.list()
  }
}
