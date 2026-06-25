import type { ComponentType } from "react"
import {
  CalendarCheck,
  CalendarPlus,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react"

export type SectionKey = "dashboard" | "play" | "chat" | "bookings" | "book"

export interface NavItem<K extends string = string> {
  key: K
  /** App Router path for this section. */
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Short description shown under the page title in the top bar. */
  caption: string
  badge?: string
  /**
   * Resolved by {@link activeNavItem} (so the topbar gets a title) but kept out
   * of the sidebar — used for transient flows like the booking wizard that have
   * a route but no permanent menu slot.
   */
  hidden?: boolean
}

export const NAV: NavItem<SectionKey>[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    caption: "Your court at a glance",
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
    key: "book",
    href: "/dashboard/book",
    label: "Book a court",
    icon: CalendarPlus,
    caption: "Reserve your slot",
    hidden: true,
  },
]

/** Whether a nav href is active for the given pathname. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The nav item matching the current pathname (falls back to the overview). */
export function activeNavItem(pathname: string): NavItem<SectionKey> {
  return NAV.find((item) => isNavActive(item.href, pathname)) ?? NAV[0]
}
