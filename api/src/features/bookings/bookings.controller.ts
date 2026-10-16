import { Body, Controller, Get, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { PayoutService } from "../brands/payout.service.js"
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
  constructor(
    private readonly bookings: BookingsService,
    private readonly payouts: PayoutService
  ) {}

  /**
   * Create a booking the player is about to pay for (`awaiting_payment`). No
   * hold: it never expires and doesn't block the slot. The venue must have
   * declared a bank account, or there is nowhere to pay.
   */
  @Post()
  async create(@UserId() userId: string, @Body() body: CreateBookingDto) {
    const venueId = await this.bookings.findVenueByCourtId(body.courtId)
    if (venueId) await this.payouts.assertAcceptsOnline(venueId)
    return this.bookings.createHold(userId, body)
  }

  /** Every booking the signed-in player owns. */
  @Get("mine")
  async mine(@UserId() userId: string) {
    return this.bookings.listMine(userId)
  }

  /**
   * Player cancel — only before a transfer proof was sent. After that the
   * player and venue settle it in chat and the venue cancels + refunds.
   */
  @Post(":id/cancel")
  async cancel(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: CancelBookingDto
  ) {
    return this.bookings.cancel(userId, param.id, body.reason)
  }

  /** Venue approves (the money arrived) or declines with a reason (refund follows). */
  @Post(":id/decision")
  async decision(
    @UserId() userId: string,
    @Param() param: BookingIdParamDto,
    @Body() body: BookingDecisionDto
  ) {
    return this.bookings.decide(userId, param.id, body.decision, body.reason)
  }

  /** Venue no-show, gated to ≥30 minutes past the booking's start time. */
  @Post(":id/no-show")
  async noShow(@UserId() userId: string, @Param() param: BookingIdParamDto) {
    return this.bookings.markNoShow(userId, param.id)
  }
}
