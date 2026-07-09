import { NAV, activeNavItem, type NavItem } from "@/features/dashboard/nav"
import {
  VENUE_BASE_PREFIX,
  venueBase,
  venueNav,
} from "@/features/venue/nav"

/**
 * SportMatch has two surfaces of the same dashboard: the **player** workspace
 * (find courts, queue matches) and the **venue** workspace (run a club). Rather
 * than a stateful toggle, the active workspace is *derived from the route* —
 * anything under {@link VENUE_BASE_PREFIX} is the venue surface — so a deep link,
 * a refresh and the sidebar always agree, with no provider to keep in sync.
 *
 * The venue workspace is **per-venue**: each venue gets its own URL subtree at
 * `/dashboard/venue/[venueId]/*`, so the active venue is the `[venueId]` in the
 * path — not a cookie. Switching venues is a plain navigation.
 */
export type Workspace = "player" | "venue"

/** The workspace a pathname belongs to. */
export function workspaceForPath(pathname: string): Workspace {
  return pathname.startsWith(`${VENUE_BASE_PREFIX}/`) ? "venue" : "player"
}

/** Extract the `[venueId]` from a venue-workspace pathname, or null. */
export function venueIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/venue\/([^/]+)/)
  return match ? match[1] : null
}

export interface NavContext {
  workspace: Workspace
  /** i18n namespace holding this workspace's nav labels/captions. */
  ns: "Nav" | "VenueNav"
  items: NavItem[]
  active: NavItem
  /** The active venue id when in the venue workspace, else null. */
  venueId: string | null
}

/**
 * Resolve everything the sidebar and topbar need for the current route in one
 * place: which nav to render, which item is active, the matching i18n namespace,
 * and the active venue id. The venue base must be checked before the player nav,
 * whose `/dashboard` home would otherwise also match venue paths.
 */
export function navContext(pathname: string): NavContext {
  if (workspaceForPath(pathname) === "venue") {
    const venueId = venueIdFromPath(pathname)
    if (venueId) {
      const items = venueNav(venueId)
      const base = venueBase(venueId)
      const active =
        items.find((item) =>
          // The venue base is a prefix of every sub-route, so it must match
          // exactly — otherwise Command Center stays active everywhere.
          item.href === base
            ? pathname === base
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
        ) ?? items[0]
      return { workspace: "venue", ns: "VenueNav", items, active, venueId }
    }
  }
  return {
    workspace: "player",
    ns: "Nav",
    items: NAV,
    active: activeNavItem(pathname),
    venueId: null,
  }
}
