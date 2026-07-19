import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Post,
  Put,
} from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import {
  BlockIdParamDto,
  CourtBlockInputDto,
  CourtIdParamDto,
  CourtInputDto,
  CourtPatchDto,
  CustomerDto,
  RescheduleDto,
  ReservationIdParamDto,
  ReservationStatusDto,
  VenuePatchDto,
  WalkInInputDto,
} from "./venues.dto.js"
import { VenuesService } from "./venues.service.js"

// Venue management (operator-owned CRUD), mounted at /api/venues. Each account
// owns exactly one venue, so every route resolves the caller's venue from their
// Clerk id (no `:id` in the path) — there is no cross-venue access. The service
// throws domain exceptions the central filter maps to the right status.
@Controller("venues")
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** The caller's own venueId, or 404 when they haven't provisioned one. */
  private async myVenueId(userId: string): Promise<string> {
    const id = await this.venues.myVenueId(userId)
    if (!id) throw new NotFoundException("No venue for this account")
    return id
  }

  @Put()
  async update(@UserId() userId: string, @Body() body: VenuePatchDto) {
    return this.venues.updateVenue(await this.myVenueId(userId), body)
  }

  /** Archive the caller's venue (decision #11) — replaces a hard delete. */
  @Delete()
  async archive(@UserId() userId: string) {
    await this.venues.archiveVenue(await this.myVenueId(userId))
    return { ok: true }
  }

  // ── Courts ──
  @Post("courts")
  async addCourt(@UserId() userId: string, @Body() body: CourtInputDto) {
    return this.venues.addCourt(await this.myVenueId(userId), body)
  }

  @Put("courts/:courtId")
  async updateCourt(
    @UserId() userId: string,
    @Param() param: CourtIdParamDto,
    @Body() body: CourtPatchDto
  ) {
    return this.venues.updateCourt(
      await this.myVenueId(userId),
      param.courtId,
      body
    )
  }

  @Delete("courts/:courtId")
  async removeCourt(@UserId() userId: string, @Param() param: CourtIdParamDto) {
    await this.venues.removeCourt(await this.myVenueId(userId), param.courtId)
    return { ok: true }
  }

  // ── Reservations ──
  @Post("reservations/walk-in")
  async addWalkIn(@UserId() userId: string, @Body() body: WalkInInputDto) {
    return this.venues.addWalkInReservation(await this.myVenueId(userId), body)
  }

  @Put("reservations/:reservationId/status")
  async updateReservationStatus(
    @UserId() userId: string,
    @Param() param: ReservationIdParamDto,
    @Body() body: ReservationStatusDto
  ) {
    return this.venues.updateReservationStatus(
      await this.myVenueId(userId),
      param.reservationId,
      body.status,
      body.reason
    )
  }

  @Put("reservations/:reservationId")
  async rescheduleReservation(
    @UserId() userId: string,
    @Param() param: ReservationIdParamDto,
    @Body() body: RescheduleDto
  ) {
    return this.venues.rescheduleReservation(
      await this.myVenueId(userId),
      param.reservationId,
      body
    )
  }

  // ── Customers ──
  @Post("customers")
  async addCustomer(@UserId() userId: string, @Body() body: CustomerDto) {
    return this.venues.addCustomer(await this.myVenueId(userId), body)
  }

  // ── Court blocks (decision #12) ──
  @Post("blocks")
  async addBlock(@UserId() userId: string, @Body() body: CourtBlockInputDto) {
    return this.venues.addBlock(await this.myVenueId(userId), body)
  }

  @Delete("blocks/:blockId")
  async removeBlock(@UserId() userId: string, @Param() param: BlockIdParamDto) {
    await this.venues.removeBlock(await this.myVenueId(userId), param.blockId)
    return { ok: true }
  }
}
