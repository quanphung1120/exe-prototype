import { NAV, activeNavItem, type NavItem } from "@/components/dashboard/nav"
import { VENUE_BASE, VENUE_NAV } from "@/components/dashboard/venue/nav"

/**
 * SportMatch has two surfaces of the same dashboard: the **player** workspace
 * (find courts, queue matches) and the **venue** workspace (run a club). Rather
 * than a stateful toggle, the active workspace is *derived from the route* —
 * anything under {@link VENUE_BASE} is the venue surface — so a deep link, a
 * refresh and the sidebar always agree, with no provider to keep in sync.
 */
export type Workspace = "player" | "venue"

export interface WorkspaceMeta {
  key: Workspace
  /** Where the workspace switcher lands when this surface is chosen. */
  home: string
  /** Two-letter mark shown in the switcher tile. */
  badge: string
}

export const WORKSPACES: Record<Workspace, WorkspaceMeta> = {
  player: { key: "player", home: "/dashboard", badge: "SM" },
  venue: { key: "venue", home: VENUE_BASE, badge: "SR" },
}

/** The workspace a pathname belongs to. */
export function workspaceForPath(pathname: string): Workspace {
  return pathname === VENUE_BASE || pathname.startsWith(`${VENUE_BASE}/`)
    ? "venue"
    : "player"
}

export interface NavContext {
  workspace: Workspace
  /** i18n namespace holding this workspace's nav labels/captions. */
  ns: "Nav" | "VenueNav"
  items: NavItem[]
  active: NavItem
}

/**
 * Resolve everything the sidebar and topbar need for the current route in one
 * place: which nav to render, which item is active, and the matching i18n
 * namespace. The venue base must be checked before the player nav, whose
 * `/dashboard` home would otherwise also match venue paths.
 */
export function navContext(pathname: string): NavContext {
  if (workspaceForPath(pathname) === "venue") {
    const active =
      VENUE_NAV.find((item) =>
        // The venue base is a prefix of every sub-route, so it must match
        // exactly — otherwise Command Center stays active everywhere.
        item.href === VENUE_BASE
          ? pathname === VENUE_BASE
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
      ) ?? VENUE_NAV[0]
    return { workspace: "venue", ns: "VenueNav", items: VENUE_NAV, active }
  }
  return {
    workspace: "player",
    ns: "Nav",
    items: NAV,
    active: activeNavItem(pathname),
  }
}
