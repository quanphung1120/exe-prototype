import { Body, Controller, Get, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { VenueSetupDto } from "./venues.dto.js"
import { VenuesService } from "./venues.service.js"

// Venue-workspace (operator) endpoints, mounted at /api/venue. Each account owns
// exactly one venue, so every read resolves the caller's own venue from their
// Clerk id — an account with no venue yet gets 404 (the web routes them to setup).
@Controller("venue")
export class VenueController {
  constructor(private readonly venues: VenuesService) {}

  /** Provision the account's single venue (guided setup wizard). */
  @Post("setup")
  setup(@UserId() userId: string, @Body() body: VenueSetupDto) {
    return this.venues.provisionVenue(userId, body)
  }

  @Get("bundle")
  bundle(@UserId() userId: string) {
    return this.venues.myBundle(userId)
  }

  @Get()
  async summary(@UserId() userId: string) {
    const b = await this.venues.myBundle(userId)
    return { venue: b.info, stats: b.stats }
  }

  @Get("courts")
  async courts(@UserId() userId: string) {
    return (await this.venues.myBundle(userId)).courts
  }

  @Get("reservations")
  async reservations(@UserId() userId: string) {
    return (await this.venues.myBundle(userId)).reservations
  }

  @Get("customers")
  async customers(@UserId() userId: string) {
    return (await this.venues.myBundle(userId)).customers
  }

  @Get("analytics")
  async analytics(@UserId() userId: string) {
    const b = await this.venues.myBundle(userId)
    return {
      stats: b.stats,
      revenueSeries: b.revenueSeries,
      sportMix: b.sportMix,
      channelMix: b.channelMix,
      peakHours: b.peakHours,
    }
  }

  @Get("insights")
  async insights(@UserId() userId: string) {
    return (await this.venues.myBundle(userId)).insights
  }
}
