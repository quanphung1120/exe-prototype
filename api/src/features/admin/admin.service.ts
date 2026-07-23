import { Inject, Injectable } from "@nestjs/common"

import type { RefundQueueItem, Venue as VenueInfo } from "../../shared/index.js"

import type { BookingSummary } from "../bookings/booking.helpers.js"
import { BookingsService } from "../bookings/bookings.service.js"
import { BrandsService } from "../brands/brands.service.js"
import { ProfileService } from "../players/profile.service.js"
import { SessionsService } from "../sessions/sessions.service.js"
import { VenuesService } from "../venues/venues.service.js"

/** One brand's venue branches, each with its aggregate booking/revenue totals. */
export interface AdminVenueRow extends VenueInfo {
  bookings: number
  revenue: number
}

export interface AdminBrandGroup {
  brand: { id: string; name: string; initials: string } | null
  venues: AdminVenueRow[]
}

export interface AdminOverview {
  users: number
  brands: number
  venues: { total: number; pending: number; approved: number; rejected: number }
  bookings: number
  /** Sum of every venue's paid booking revenue (VND) — see `BookingsService#venueTotals`. */
  grossRevenue: number
  activeSessions: number
  pendingRefunds: number
  pendingApprovals: number
}

// Cross-tenant reads/mutations for the admin workspace — deliberately its own
// feature rather than an admin-bypass flag threaded through every existing
// owner-scoped service (VenuesService.assertOwnsVenue and friends stay
// unchanged; this composes their unscoped methods instead). Every route this
// backs is gated by `@Roles("admin")` + `RolesGuard` at the controller — this
// service itself performs no authorization, same convention as
// `BookingsService`/`VenuesService` trusting their callers.
@Injectable()
export class AdminService {
  constructor(
    @Inject(VenuesService) private readonly venues: VenuesService,
    @Inject(BrandsService) private readonly brands: BrandsService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(SessionsService) private readonly sessions: SessionsService
  ) {}

  async overview(): Promise<AdminOverview> {
    const [
      allVenues,
      brands,
      bookingCount,
      venueTotals,
      activeSessions,
      refundQueue,
      users,
    ] = await Promise.all([
      this.venues.listVenues(),
      this.brands.listAll(),
      this.bookings.count(),
      // Same per-venue paid-revenue totals the Venues & brands table sums —
      // reused here (rather than a second, independently-sourced aggregate)
      // so this KPI always reconciles with that table's Revenue column.
      this.bookings.venueTotals(),
      this.sessions.countActive(),
      this.bookings.listRefundQueueAll(),
      this.profiles.countUsers(),
    ])

    const pending = allVenues.filter((v) => v.approval === "pending").length
    const rejected = allVenues.filter((v) => v.approval === "rejected").length
    const approved = allVenues.length - pending - rejected
    const grossRevenue = Array.from(venueTotals.values()).reduce(
      (sum, t) => sum + t.revenue,
      0
    )

    return {
      users,
      brands: brands.length,
      venues: { total: allVenues.length, pending, approved, rejected },
      bookings: bookingCount,
      grossRevenue,
      activeSessions,
      pendingRefunds: refundQueue.length,
      pendingApprovals: pending,
    }
  }

  /** Every brand and its venue branches, each with aggregate booking/revenue totals. */
  async venuesAndBrands(): Promise<AdminBrandGroup[]> {
    const [allVenues, allBrands, totals] = await Promise.all([
      this.venues.listVenues(),
      this.brands.listAll(),
      this.bookings.venueTotals(),
    ])

    const withTotals = (v: VenueInfo): AdminVenueRow => {
      const t = totals.get(v.id)
      return { ...v, bookings: t?.bookings ?? 0, revenue: t?.revenue ?? 0 }
    }

    const groups = new Map<string, AdminBrandGroup>()
    for (const brand of allBrands) {
      groups.set(brand.id, {
        brand: { id: brand.id, name: brand.name, initials: brand.initials },
        venues: [],
      })
    }
    const ownerless: AdminVenueRow[] = []
    for (const venue of allVenues) {
      const row = withTotals(venue)
      if (venue.brandId && groups.has(venue.brandId)) {
        groups.get(venue.brandId)!.venues.push(row)
      } else {
        ownerless.push(row)
      }
    }

    const result = Array.from(groups.values())
    if (ownerless.length > 0) {
      result.push({ brand: null, venues: ownerless })
    }
    return result
  }

  /** Recent bookings/transactions across every venue, most recent first. */
  async recentBookings(limit?: number): Promise<BookingSummary[]> {
    return this.bookings.listRecent(limit)
  }

  /** Every venue still awaiting admin review, oldest-first. */
  async pendingApprovals(): Promise<VenueInfo[]> {
    return this.venues.listPendingApprovals()
  }

  async approveVenue(venueId: string): Promise<VenueInfo> {
    return this.venues.setApproval(venueId, "approved")
  }

  async rejectVenue(venueId: string, reason?: string): Promise<VenueInfo> {
    return this.venues.setApproval(venueId, "rejected", reason)
  }

  /** Cross-tenant venue suspend/restore — no ownership to check, admin-only. */
  async suspendVenue(venueId: string): Promise<void> {
    await this.venues.archiveVenue(venueId)
  }

  async restoreVenue(venueId: string): Promise<VenueInfo> {
    return this.venues.updateVenue(venueId, { archived: false })
  }

  /** The global manual-refund worklist, across every venue, oldest first. */
  async refundQueue(): Promise<(RefundQueueItem & { venueId: string })[]> {
    return this.bookings.listRefundQueueAll()
  }

  async settleRefund(bookingId: string, ref?: string): Promise<void> {
    await this.bookings.settleRefund(bookingId, ref)
  }

  async forceCancelBooking(
    bookingId: string,
    reason?: string
  ): Promise<BookingSummary> {
    return this.bookings.adminForceCancel(bookingId, reason)
  }
}
