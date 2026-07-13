"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Check, Clock, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useData } from "@/features/dashboard/data-provider"
import { useSession } from "@/features/play/session"

export type {
  ExpiredEvent,
  PartnerSearch,
  QuickJoinFilters,
} from "@/features/play/session"

/**
 * Back-compat facade over the unified {@link useSession} store. The Match Maker
 * surfaces (lobby list, Quick Match, the active-room sheet) consume this and
 * keep working against the legacy `MatchRoom` shape via projections.
 */
export function useMatchmaking() {
  const s = useSession()
  return {
    sessions: s.sessions,
    rooms: s.rooms,
    joinedIds: s.joinedIds,
    joinedRooms: s.joinedRooms,
    requestedIds: s.requestedIds,
    hostedRoomCount: s.hostedRoomCount,
    maxHostedRooms: s.maxHostedRooms,
    canHostMore: s.canHostMore,
    activeRoom: s.activeRoom,
    activeSession: s.activeSession,
    activeRoomId: s.activeRoomId,
    setActiveRoomId: s.setActiveRoomId,
    userLevel: s.userLevel,
    setUserLevel: s.setUserLevel,
    userLevels: s.userLevels,
    userLevelForSport: s.userLevelForSport,
    userName: s.userName,
    setUserName: s.setUserName,
    search: s.search,
    expiredEvents: s.expiredEvents,
    isSuitable: s.isSuitable,
    hasTimeConflict: s.hasTimeConflict,
    joinRoom: s.joinRoom,
    approveRequest: s.approveRequest,
    declineRequest: s.declineRequest,
    leaveRoom: s.leaveRoom,
    addRoom: s.addRoom,
    quickJoin: s.quickJoin,
    cancelSearch: s.cancelSearch,
    dismissSearch: s.dismissSearch,
    setRoomCapacity: s.setRoomCapacity,
    invitePlayer: s.invitePlayer,
    kickPlayer: s.kickPlayer,
    fillRoom: s.fillRoom,
    managerOpen: s.managerOpen,
    setManagerOpen: s.setManagerOpen,
    openManager: s.openManager,
    quickJoinOpen: s.quickJoinOpen,
    setQuickJoinOpen: s.setQuickJoinOpen,
    openQuickJoin: s.openQuickJoin,
    createRoomOpen: s.createRoomOpen,
    setCreateRoomOpen: s.setCreateRoomOpen,
    openCreateRoom: s.openCreateRoom,
  }
}

/**
 * Floating Quick Match dock. Fixed to the viewport so it stays put while the
 * user browses other dashboard pages during a search.
 */
export function MatchmakingDock() {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const { search, userLevelForSport, cancelSearch, dismissSearch, openManager } =
    useMatchmaking()
  const { playerByInitials } = useData()
  const ready = search?.status === "ready"
  const partnerName = search?.partner
    ? playerByInitials(search.partner).name
    : ""

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
      <AnimatePresence>
        {search ? (
          <motion.div
            key="dock"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="pointer-events-auto w-full max-w-lg"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-full bg-card/95 py-2 pr-2 pl-4 shadow-xl ring-1 ring-foreground/10 backdrop-blur">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime to-brand text-brand-foreground">
                {ready ? (
                  <Check className="size-4" />
                ) : (
                  <Loader2 className="size-4 animate-spin" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-none font-semibold">
                  {ready ? t("dock.roomReady") : t("dock.findingPartner")}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {ready
                    ? t("dock.found", { name: partnerName })
                    : `${tc(`sports.${search.sport}`)} · ${tc(
                        `format.${search.format.toLowerCase()}`
                      )} · ${tc(`levels.${userLevelForSport(search.sport)}`)}`}
                </p>
              </div>

              {!ready ? (
                <span className="hidden items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums sm:inline-flex">
                  <Clock className="size-3.5" />
                  {Math.floor(search.elapsed / 60)}:
                  {String(search.elapsed % 60).padStart(2, "0")}
                </span>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                {ready ? (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => search.roomId && openManager(search.roomId)}
                  >
                    {t("dock.manage")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  aria-label={
                    ready ? t("dock.dismiss") : t("dock.cancelSearch")
                  }
                  onClick={ready ? dismissSearch : cancelSearch}
                >
                  <X />
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
