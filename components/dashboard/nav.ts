import type { ComponentType } from "react"
import {
  CalendarCheck,
  Flame,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Sparkles,
} from "lucide-react"

export type SectionKey =
  | "dashboard"
  | "match-maker"
  | "find-courts"
  | "chat"
  | "bookings"
  | "streak"

export interface NavItem {
  key: SectionKey
  /** App Router path for this section. */
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Short description shown under the page title in the top bar. */
  caption: string
  badge?: string
}

export const NAV: NavItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    caption: "Your court at a glance",
  },
  {
    key: "match-maker",
    href: "/dashboard/match-maker",
    label: "Match Maker",
    icon: Sparkles,
    caption: "Find, host or queue a match",
    badge: "AI",
  },
  {
    key: "find-courts",
    href: "/dashboard/find-courts",
    label: "Find Courts",
    icon: MapPin,
    caption: "Open slots near you",
  },
  {
    key: "chat",
    href: "/dashboard/chat",
    label: "Chat",
    icon: MessageSquare,
    caption: "Coordinate your next match",
    badge: "2",
  },
  {
    key: "bookings",
    href: "/dashboard/bookings",
    label: "Bookings",
    icon: CalendarCheck,
    caption: "Upcoming and past matches",
    badge: "3",
  },
  {
    key: "streak",
    href: "/dashboard/streak",
    label: "Streak",
    icon: Flame,
    caption: "Keep the momentum alive",
    badge: "6",
  },
]

/** Whether a nav href is active for the given pathname. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The nav item matching the current pathname (falls back to the overview). */
export function activeNavItem(pathname: string): NavItem {
  return NAV.find((item) => isNavActive(item.href, pathname)) ?? NAV[0]
}
