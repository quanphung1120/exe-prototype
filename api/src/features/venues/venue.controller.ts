import { Controller, Get, Query } from "@nestjs/common"
import * as z from "zod"

import { ZodValidationPipe } from "../../common/zod-validation.pipe.js"
import { VenuesService } from "./venues.service.js"

const venueQuery = z.object({ venue: z.string().min(1).optional() })
const bundleQuery = z.object({ venue: z.string().min(1) })

// Venue-workspace (operator) read endpoints, mounted at /api/venue. `?venue=`
// selects which venue's bundle to read (defaults to the first, except `/bundle`
// which throws NotFound → 404 on an unknown id — no silent fallback).
@Controller("venue")
export class VenueController {
  constructor(private readonly venues: VenuesService) {}

  @Get("bundle")
  bundle(
    @Query(new ZodValidationPipe(bundleQuery)) query: z.infer<typeof bundleQuery>
  ) {
    return this.venues.venueBundle(query.venue)
  }

  @Get()
  async summary(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    const b = await this.venues.activeBundle(query.venue)
    return { venue: b.info, stats: b.stats }
  }

  @Get("courts")
  async courts(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    return (await this.venues.activeBundle(query.venue)).courts
  }

  @Get("reservations")
  async reservations(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    return (await this.venues.activeBundle(query.venue)).reservations
  }

  @Get("customers")
  async customers(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    return (await this.venues.activeBundle(query.venue)).customers
  }

  @Get("analytics")
  async analytics(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    const b = await this.venues.activeBundle(query.venue)
    return {
      stats: b.stats,
      revenueSeries: b.revenueSeries,
      sportMix: b.sportMix,
      channelMix: b.channelMix,
      peakHours: b.peakHours,
    }
  }

  @Get("insights")
  async insights(
    @Query(new ZodValidationPipe(venueQuery)) query: z.infer<typeof venueQuery>
  ) {
    return (await this.venues.activeBundle(query.venue)).insights
  }
}
