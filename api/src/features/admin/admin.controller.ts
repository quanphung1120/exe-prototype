import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"

import { Roles } from "../../common/roles.decorator.js"
import { RolesGuard } from "../../common/roles.guard.js"
import {
  BookingIdParamDto,
  ForceCancelBookingDto,
  ListBookingsQueryDto,
  RejectVenueDto,
  SettleRefundDto,
  VenueIdParamDto,
} from "./admin.dto.js"
import { AdminService } from "./admin.service.js"

/**
 * The admin workspace's api surface, mounted at /api/admin — every route here
 * requires the caller's Clerk session to carry the `"admin"` role (granted
 * manually in the Clerk dashboard, see `ClerkAuthGuard`'s docstring). Cross-
 * tenant by design: unlike `VenuesController`/`BookingsController`, nothing
 * here checks `ownerId` — `RolesGuard` is the only gate.
 */
@Controller("admin")
@Roles("admin")
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview()
  }

  @Get("venues")
  venuesAndBrands() {
    return this.admin.venuesAndBrands()
  }

  @Get("bookings")
  bookings(@Query() query: ListBookingsQueryDto) {
    return this.admin.recentBookings(query.limit ? Number(query.limit) : undefined)
  }

  @Get("refunds")
  refunds() {
    return this.admin.refundQueue()
  }

  @Get("approvals")
  approvals() {
    return this.admin.pendingApprovals()
  }

  @Post("venues/:venueId/approve")
  approveVenue(@Param() param: VenueIdParamDto) {
    return this.admin.approveVenue(param.venueId)
  }

  @Post("venues/:venueId/reject")
  rejectVenue(@Param() param: VenueIdParamDto, @Body() body: RejectVenueDto) {
    return this.admin.rejectVenue(param.venueId, body.reason)
  }

  @Post("venues/:venueId/suspend")
  async suspendVenue(@Param() param: VenueIdParamDto) {
    await this.admin.suspendVenue(param.venueId)
    return { ok: true }
  }

  @Post("venues/:venueId/restore")
  restoreVenue(@Param() param: VenueIdParamDto) {
    return this.admin.restoreVenue(param.venueId)
  }

  @Post("refunds/:bookingId/settle")
  async settleRefund(
    @Param() param: BookingIdParamDto,
    @Body() body: SettleRefundDto
  ) {
    await this.admin.settleRefund(param.bookingId, body.ref)
    return { ok: true }
  }

  @Post("bookings/:bookingId/cancel")
  forceCancelBooking(
    @Param() param: BookingIdParamDto,
    @Body() body: ForceCancelBookingDto
  ) {
    return this.admin.forceCancelBooking(param.bookingId, body.reason)
  }
}
