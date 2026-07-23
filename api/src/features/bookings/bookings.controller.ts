import { Body, Controller, Get, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import {
  BookingDecisionDto,
  BookingIdParamDto,
  CancelBookingDto,
  CreateBookingDto,
} from "./bookings.dto.js"
import { BookingsService } from "./bookings.service.js"

// The player/venue-facing bookings API (VienTD-Review Phase 3) — narrow,
// explicit-action endpoints on top of the canonical `bookings` collection,
// distinct from the venue-scoped `/api/venues/reservations/*` routes
// (VenuesController): those resolve "my venue" from the caller and expose the
// operator's full `Reservation` projection; these resolve the booking's owner
// (player: `userId` on the record; venue: the record's `venueId`'s `ownerId`)
// from the caller and return the canonical `BookingSummary` (hold expiry,
// payment state, refund — fields the operator projection doesn't carry).
@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Create an unpaid `awaiting_payment` hold with a server-side 20-minute expiry. */
  @Post()
  async create(@UserId() userId: string, @Body() body: CreateBookingDto) {
    return this.bookings.createHold(userId, body)
  }

  /** Every booking the signed-in player owns. */
  @Get("mine")
  async mine(@UserId() userId: string) {
    return this.bookings.listMine(userId)
  }

  /** Player self-cancel, refunded per the ≥24h/<24h/after-start policy. */
  @Post(":id/cancel")
  async cancel(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: CancelBookingDto
  ) {
    return this.bookings.cancel(userId, param.id, body.reason)
  }

  /** Venue approve/decline of a pending app booking (decline always refunds 100%). */
  @Post(":id/decision")
  async decision(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: BookingDecisionDto
  ) {
    return this.bookings.decide(userId, param.id, body.decision, body.reason)
  }

  /** Venue check-in for a confirmed booking. */
  @Post(":id/check-in")
  async checkIn(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.bookings.checkIn(userId, param.id)
  }

  /** Venue no-show, gated to ≥30 minutes past the booking's start time. */
  @Post(":id/no-show")
  async noShow(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.bookings.markNoShow(userId, param.id)
  }
}
