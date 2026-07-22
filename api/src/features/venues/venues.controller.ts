import { Body, Controller, Delete, Param, Post, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import {
  CourtBlockInputDto,
  CourtInputDto,
  CourtPatchDto,
  CustomerDto,
  RescheduleDto,
  ReservationStatusDto,
  VenueBlockParamDto,
  VenueCourtParamDto,
  VenueIdParamDto,
  VenuePatchDto,
  VenueReservationParamDto,
  WalkInInputDto,
} from "./venues.dto.js"
import { VenuesService } from "./venues.service.js"

// Venue management (operator-owned CRUD), mounted at /api/venues/:venueId. An
// account's brand may own many venue branches, so the target branch is carried
// in the path and `assertOwnsVenue` authorizes the caller against it (404 for an
// unknown venue, 403 for another account's). The service throws domain
// exceptions the central filter maps to the right status.
@Controller("venues")
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** Authorize the caller owns `venueId`, then hand it back for the mutation. */
  private async ownedVenueId(userId: string, venueId: string): Promise<string> {
    await this.venues.assertOwnsVenue(userId, venueId)
    return venueId
  }

  @Put(":venueId")
  async update(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: VenuePatchDto
  ) {
    return this.venues.updateVenue(
      await this.ownedVenueId(userId, param.venueId),
      body
    )
  }

  /** Archive one of the caller's branches (decision #11) — replaces a delete. */
  @Delete(":venueId")
  async archive(@UserId() userId: string, @Param() param: VenueIdParamDto) {
    await this.venues.archiveVenue(
      await this.ownedVenueId(userId, param.venueId)
    )
    return { ok: true }
  }

  // ── Courts ──
  @Post(":venueId/courts")
  async addCourt(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: CourtInputDto
  ) {
    return this.venues.addCourt(
      await this.ownedVenueId(userId, param.venueId),
      body
    )
  }

  @Put(":venueId/courts/:courtId")
  async updateCourt(
    @UserId() userId: string,
    @Param() param: VenueCourtParamDto,
    @Body() body: CourtPatchDto
  ) {
    return this.venues.updateCourt(
      await this.ownedVenueId(userId, param.venueId),
      param.courtId,
      body
    )
  }

  @Delete(":venueId/courts/:courtId")
  async removeCourt(
    @UserId() userId: string,
    @Param() param: VenueCourtParamDto
  ) {
    await this.venues.removeCourt(
      await this.ownedVenueId(userId, param.venueId),
      param.courtId
    )
    return { ok: true }
  }

  // ── Reservations ──
  @Post(":venueId/reservations/walk-in")
  async addWalkIn(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: WalkInInputDto
  ) {
    return this.venues.addWalkInReservation(
      await this.ownedVenueId(userId, param.venueId),
      body
    )
  }

  @Put(":venueId/reservations/:reservationId/status")
  async updateReservationStatus(
    @UserId() userId: string,
    @Param() param: VenueReservationParamDto,
    @Body() body: ReservationStatusDto
  ) {
    return this.venues.updateReservationStatus(
      await this.ownedVenueId(userId, param.venueId),
      param.reservationId,
      body.status,
      body.reason
    )
  }

  @Put(":venueId/reservations/:reservationId")
  async rescheduleReservation(
    @UserId() userId: string,
    @Param() param: VenueReservationParamDto,
    @Body() body: RescheduleDto
  ) {
    return this.venues.rescheduleReservation(
      await this.ownedVenueId(userId, param.venueId),
      param.reservationId,
      body
    )
  }

  // ── Customers ──
  @Post(":venueId/customers")
  async addCustomer(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: CustomerDto
  ) {
    return this.venues.addCustomer(
      await this.ownedVenueId(userId, param.venueId),
      body
    )
  }

  // ── Court blocks (decision #12) ──
  @Post(":venueId/blocks")
  async addBlock(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: CourtBlockInputDto
  ) {
    return this.venues.addBlock(
      await this.ownedVenueId(userId, param.venueId),
      body
    )
  }

  @Delete(":venueId/blocks/:blockId")
  async removeBlock(
    @UserId() userId: string,
    @Param() param: VenueBlockParamDto
  ) {
    await this.venues.removeBlock(
      await this.ownedVenueId(userId, param.venueId),
      param.blockId
    )
    return { ok: true }
  }
}
