import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  LayoutDashboard,
  TicketPercent,
} from "lucide-react"

import type { NavItem } from "@/features/dashboard/nav"

export type AdminSectionKey =
  "overview" | "venues" | "bookings" | "discounts" | "refunds" | "approvals"

/** Every admin route lives under this prefix — one cross-tenant surface, not per-venue. */
export const ADMIN_BASE_PREFIX = "/dashboard/admin"

/**
 * The admin's sidebar — mirrors the player {@link NAV}/venue `venueNav` shape
 * so the sidebar and topbar render every workspace from the same components.
 * Labels/captions resolve from the `AdminNav` i18n namespace by `key`.
 */
export const ADMIN_NAV: NavItem<AdminSectionKey>[] = [
  {
    key: "overview",
    href: ADMIN_BASE_PREFIX,
    label: "Overview",
    icon: LayoutDashboard,
    caption: "System-wide KPIs",
  },
  {
    key: "venues",
    href: `${ADMIN_BASE_PREFIX}/venues`,
    label: "Venues & brands",
    icon: Building2,
    caption: "Every brand and its branches",
  },
  {
    key: "bookings",
    href: `${ADMIN_BASE_PREFIX}/bookings`,
    label: "Bookings & payments",
    icon: CalendarClock,
    caption: "Recent transactions across every venue",
  },
  {
    key: "discounts",
    href: `${ADMIN_BASE_PREFIX}/discounts`,
    label: "Coupons",
    icon: TicketPercent,
    caption: "Discount codes and usage",
  },
  {
    key: "refunds",
    href: `${ADMIN_BASE_PREFIX}/refunds`,
    label: "Refund queue",
    icon: Banknote,
    caption: "Manual refunds awaiting settlement",
  },
  {
    key: "approvals",
    href: `${ADMIN_BASE_PREFIX}/approvals`,
    label: "Approvals",
    icon: BadgeCheck,
    caption: "New venues awaiting review",
  },
]
