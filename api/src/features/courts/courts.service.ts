import { Injectable } from "@nestjs/common"

import type { Court as CourtType, SportKey } from "../../shared/index.js"

import { VenuesService } from "../venues/venues.service.js"

// The court finder now reads ONE catalog: every operator venue's courts projected
// to the discovery `Court` shape (see VenuesService.catalogCourts). This retires
// the separate hardcoded `COURTS` list so a booked court id (`vc*`) resolves back
// to its owning venue for the reservation cross-write. Kept as a thin service so
// the `/api/courts` contract and callers stay unchanged.
@Injectable()
export class CourtsService {
  constructor(private readonly venues: VenuesService) {}

  /** Every court, optionally filtered to those offering `sport`, in venue order. */
  listCourts(sport?: SportKey): Promise<CourtType[]> {
    return this.venues.catalogCourts(sport)
  }

  /** One court by its `vc*` id; throws NotFound (→ 404) when unknown. */
  getCourt(id: string): Promise<CourtType> {
    return this.venues.catalogCourt(id)
  }
}
