import { Controller, Get } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { SeedService } from "./seed.service.js"

// The aggregate the web app hydrates in a single request, mounted at /api/seed.
// The signed-in user's id (guaranteed by the global guard) drives the personal
// half of the seed and resolves their single owned venue.
@Controller("seed")
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  @Get()
  get(@UserId() userId: string) {
    return this.seed.buildSeed(userId)
  }
}
