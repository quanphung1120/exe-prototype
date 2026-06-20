import {
  BarChart3,
  CalendarRange,
  LayoutDashboard,
  Radar,
  Sparkles,
  Users,
} from "lucide-react"

import type { NavItem } from "@/components/dashboard/nav"

export type VenueSectionKey =
  | "command"
  | "schedule"
  | "reservations"
  | "monitor"
  | "analytics"
  | "customers"

/** Base path for the venue workspace; everything below it is venue-scoped. */
export const VENUE_BASE = "/dashboard/venue"

/**
 * The venue operator's sidebar. Mirrors the player {@link NAV} shape so the
 * sidebar and topbar can render either workspace from the same components.
 * Labels/captions resolve from the `VenueNav` i18n namespace by `key`.
 */
export const VENUE_NAV: NavItem<VenueSectionKey>[] = [
  {
    key: "command",
    href: VENUE_BASE,
    label: "Command Center",
    icon: LayoutDashboard,
    caption: "Your venue, live",
  },
  {
    key: "schedule",
    href: `${VENUE_BASE}/schedule`,
    label: "Schedule",
    icon: CalendarRange,
    caption: "Courts × hours, at a glance",
  },
  {
    key: "reservations",
    href: `${VENUE_BASE}/reservations`,
    label: "Reservations",
    icon: Users,
    caption: "Requests, holds and walk-ins",
  },
  {
    key: "monitor",
    href: `${VENUE_BASE}/monitor`,
    label: "AI Monitor",
    icon: Radar,
    caption: "Always-on operations intelligence",
    badge: "AI",
  },
  {
    key: "analytics",
    href: `${VENUE_BASE}/analytics`,
    label: "Analytics",
    icon: BarChart3,
    caption: "Revenue, utilization and demand",
  },
  {
    key: "customers",
    href: `${VENUE_BASE}/customers`,
    label: "Players",
    icon: Sparkles,
    caption: "Regulars, retention and reach",
  },
]
