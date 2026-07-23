import { BarChart3, CalendarRange, LayoutDashboard, Users } from "lucide-react"

import type { NavItem } from "@/features/dashboard/nav"

export type VenueSectionKey =
  | "command"
  | "schedule"
  | "analytics"
  | "customers"

/**
 * Prefix shared by every venue route. Used only for *detecting* the venue
 * workspace from a pathname; actual links carry a concrete `[venueId]` and are
 * built with {@link venueBase}.
 */
export const VENUE_BASE_PREFIX = "/dashboard/venue"

export function venueBase(venueId: string): string {
  return `${VENUE_BASE_PREFIX}/${venueId}`
}

/**
 * The venue operator's sidebar for a specific venue. Mirrors the player
 * {@link NAV} shape so the sidebar and topbar can render either workspace from
 * the same components. Labels/captions resolve from the `VenueNav` i18n
 * namespace by `key`.
 */
export function venueNav(venueId: string): NavItem<VenueSectionKey>[] {
  const base = venueBase(venueId)
  return [
    {
      key: "command",
      href: base,
      label: "Command Center",
      icon: LayoutDashboard,
      caption: "Your venue, live",
    },
    {
      key: "schedule",
      href: `${base}/schedule`,
      label: "Schedule",
      icon: CalendarRange,
      caption: "Grid and incoming requests",
    },
    {
      key: "analytics",
      href: `${base}/analytics`,
      label: "Insights",
      icon: BarChart3,
      caption: "Revenue, demand and players",
    },
    {
      key: "customers",
      href: `${base}/customers`,
      label: "Customers",
      icon: Users,
      caption: "Manage players and customer relationships",
    },
  ]
}
