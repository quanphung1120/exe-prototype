"use client"

import { MatchMakerDialogs } from "@/components/dashboard/match-maker-dialogs"
import { MatchmakingDock } from "@/components/dashboard/matchmaking"
import { PlayChooser } from "@/components/dashboard/play-chooser"
import { workspaceForPath } from "@/components/dashboard/workspace"
import { usePathname } from "@/i18n/navigation"

/**
 * Player-workspace-only floating chrome (AI court assistant, Quick Match dock,
 * the Play chooser, booking wizard and Match Maker dialogs). Hidden on venue
 * routes so the operator surface gets its own chrome instead. Lives inside the
 * shared SessionProvider so every floater keeps its state across player-section
 * navigation — and so the topbar can open the Quick Join / Create Room dialogs
 * from anywhere.
 */
export function PlayerChrome() {
  const pathname = usePathname()
  if (workspaceForPath(pathname) === "venue") return null
  // The booking wizard is a focused, full-width flow with its own action bar in
  // the bottom corner — keep the floating assistant out of it so they don't
  // overlap (and so the page stays distraction-free while paying).
  const onBookingPage = pathname === "/dashboard/book"
  return (
    <>
      <MatchmakingDock />
      <PlayChooser />
      <MatchMakerDialogs />
    </>
  )
}
