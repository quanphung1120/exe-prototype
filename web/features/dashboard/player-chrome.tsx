"use client"

import { MatchMakerDialogs } from "@/features/play/match-maker-dialogs"
import { MatchmakingDock } from "@/features/play/matchmaking"
import { PlayChooser } from "@/features/play/play-chooser"
import { workspaceForPath } from "@/features/dashboard/workspace"
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
  if (workspaceForPath(pathname) !== "player") return null
  return (
    <>
      <MatchmakingDock />
      <PlayChooser />
      <MatchMakerDialogs />
    </>
  )
}
