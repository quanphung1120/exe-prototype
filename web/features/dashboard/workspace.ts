import { NAV, activeNavItem, type NavItem } from "@/features/dashboard/nav"
import {
  VENUE_BASE_PREFIX,
  venueBase,
  venueNav,
} from "@/features/venue/nav"
import { ADMIN_BASE_PREFIX, ADMIN_NAV } from "@/features/admin/nav"

/**
 * SportMatch has three surfaces of the same dashboard: the **player** workspace
 * (find courts, queue matches), the **venue** workspace (run a club), and the
 * **admin** workspace (cross-tenant monitoring/control, gated on the caller's
 * Clerk `role`). Rather than a stateful toggle, the active workspace is
 * *derived from the route* — anything under {@link VENUE_BASE_PREFIX} or
 * {@link ADMIN_BASE_PREFIX} is that surface — so a deep link, a refresh and the
 * sidebar always agree, with no provider to keep in sync.
 *
 * The venue workspace is **per-venue**: each venue gets its own URL subtree at
 * `/dashboard/venue/[venueId]/*`, so the active venue is the `[venueId]` in the
 * path — not a cookie. Switching venues is a plain navigation. The admin
 * workspace carries no id — it's one cross-tenant surface, not per-venue.
 */
export type Workspace = "player" | "venue" | "admin"

/** The workspace a pathname belongs to. Admin is checked first — a specific
 * prefix must win over the player nav's `/dashboard` fallback. */
export function workspaceForPath(pathname: string): Workspace {
  if (pathname === ADMIN_BASE_PREFIX || pathname.startsWith(`${ADMIN_BASE_PREFIX}/`))
    return "admin"
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
  ns: "Nav" | "VenueNav" | "AdminNav"
  items: NavItem[]
  active: NavItem
  /** The active venue id when in the venue workspace, else null. */
  venueId: string | null
}

/**
 * Resolve everything the sidebar and topbar need for the current route in one
 * place: which nav to render, which item is active, the matching i18n namespace,
 * and the active venue id. The venue/admin bases must be checked before the
 * player nav, whose `/dashboard` home would otherwise also match those paths.
 */
export function navContext(pathname: string): NavContext {
  const workspace = workspaceForPath(pathname)

  if (workspace === "admin") {
    return {
      workspace: "admin",
      ns: "AdminNav",
      items: ADMIN_NAV,
      active: ADMIN_NAV.find((item) =>
        // The admin base (Overview) is a prefix of every sub-route, so it must
        // match exactly — otherwise Overview stays active everywhere, same
        // gotcha as the venue base below.
        item.href === ADMIN_BASE_PREFIX
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
      ) ?? ADMIN_NAV[0],
      venueId: null,
    }
  }

  if (workspace === "venue") {
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
