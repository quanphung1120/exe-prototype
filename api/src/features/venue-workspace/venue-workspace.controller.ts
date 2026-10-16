import { Body, Controller, Get, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { VenueIdParamDto, VenueSetupDto } from "../venues/venues.dto.js"
import { PayoutService } from "../brands/payout.service.js"
import { VenuesService } from "../venues/venues.service.js"

// Venue-workspace (operator) read endpoints, mounted at /api/venue. An account's
// brand may own many venue branches: `GET /:venueId/bundle` loads one branch's
// full operator bundle (authorized by owner). `GET /bundle` (the account's
// default branch) is kept for the "do I have a venue yet?" gate — 404 routes a
// fresh account to setup. (The brand + branch list the switcher needs already
// rides along in the aggregate `/api/seed` payload, so it needs no route here.)
@Controller("venue")
export class VenueWorkspaceController {
  constructor(
    private readonly venues: VenuesService,
    private readonly payouts: PayoutService
  ) {}

  /** Provision a venue branch (guided setup wizard); the first also mints the brand. */
  @Post("setup")
  async setup(@UserId() userId: string, @Body() body: VenueSetupDto) {
    const bundle = await this.venues.provisionVenue(userId, body)
    // The brand exists now; save where its players pay. A bad account number
    // surfaces here, after the branch was created — the wizard then sends the
    // owner to fix it on the manage screen.
    if (body.payout) await this.payouts.setPayout(userId, body.payout)
    return bundle
  }

  /** The account's default (first) branch bundle — the setup/redirect gate. */
  @Get("bundle")
  bundle(@UserId() userId: string) {
    return this.venues.myBundle(userId)
  }

  /**
   * Every branch this account owns with a court-status rollup — the Manage
   * screen's cross-branch overview table (plan 021). A literal two-segment
   * path, so it never collides with `GET /:venueId/bundle` below (which
   * requires a literal "bundle" second segment).
   */
  @Get("branches/summary")
  branchesSummary(@UserId() userId: string) {
    return this.venues.branchesSummary(userId)
  }

  /** One specific branch's full operator bundle (authorized by owner). */
  @Get(":venueId/bundle")
  async branchBundle(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto
  ) {
    await this.venues.assertOwnsVenue(userId, param.venueId)
    return this.venues.venueBundle(param.venueId)
  }
}
