import type { BookingRecord, RefundQueueItem, Venue } from "@/lib/shared"

/** `GET /api/admin/overview` — system-wide KPIs, the admin landing page. */
export interface AdminOverview {
  users: number
  brands: number
  venues: { total: number; pending: number; approved: number; rejected: number }
  bookings: number
  /** Sum of every `Payment` marked paid, across every venue (VND). */
  grossRevenue: number
  activeSessions: number
  pendingRefunds: number
  pendingApprovals: number
}

/** One venue branch plus its aggregate booking/revenue totals (admin-only view). */
export interface AdminVenueRow extends Venue {
  bookings: number
  revenue: number
}

/** `GET /api/admin/venues` — every brand and its branches. */
export interface AdminBrandGroup {
  brand: { id: string; name: string; initials: string } | null
  venues: AdminVenueRow[]
}

/** `GET /api/admin/bookings` — one row of the cross-tenant transactions table. */
export type AdminBookingRow = Pick<
  BookingRecord,
  | "bookingId"
  | "venueId"
  | "courtId"
  | "courtName"
  | "sport"
  | "source"
  | "userId"
  | "startAt"
  | "dateKey"
  | "start"
  | "durationMin"
  | "price"
  | "status"
  | "paymentStatus"
>

/** `GET /api/admin/refunds` — the global manual-refund worklist. */
export type AdminRefundRow = RefundQueueItem & { venueId: string }

/** `GET /api/admin/approvals` — venues awaiting admin review. */
export type AdminApprovalRow = Venue
