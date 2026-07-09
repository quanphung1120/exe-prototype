import { Controller, Get, Query } from "@nestjs/common"
import * as z from "zod"

import { UserId } from "../../common/user-id.decorator.js"
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js"
import { SeedService } from "./seed.service.js"

const seedQuery = z.object({
  // Which venue's operator bundle to hydrate (defaults to the first venue).
  venue: z.string().min(1).optional(),
})

// The aggregate the web app hydrates in a single request, mounted at /api/seed.
// The signed-in user's id (guaranteed by the global guard) drives the personal
// half of the seed; `?venue=` selects which venue's operator bundle to include.
@Controller("seed")
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  @Get()
  get(
    @UserId() userId: string,
    @Query(new ZodValidationPipe(seedQuery)) query: z.infer<typeof seedQuery>
  ) {
    return this.seed.buildSeed(query.venue, userId)
  }
}
