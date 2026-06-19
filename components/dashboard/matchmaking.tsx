"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Clock, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  COURTS,
  MATCH_SUGGESTIONS,
  ROOMS,
  USER,
  levelMatches,
  playerByInitials,
  type Court,
  type Level,
  type MatchRoom,
  type Player,
  type SportKey,
} from "@/components/dashboard/data"

// How long the faked partner search runs before it finds someone.
const SEARCH_MS = 1800
// Largest room a host can grow to.
const MAX_CAPACITY = 8

/**
 * The Quick Match fallback: a faked search for the user's first compatible
 * partner. Once one is found a seed room is created and `status` flips to
 * "ready"; shown in the floating dock throughout.
 */
export interface PartnerSearch {
  sport: SportKey
  format: "Singles" | "Doubles"
  maxPlayers: number
  elapsed: number
  status: "searching" | "ready"
  /** Initials of the found partner (set when status === "ready"). */
  partner: string | null
  /** Id of the created seed room (set when status === "ready"). */
  roomId: string | null
}

/** Constraints the Quick Join popover applies to the auto-pick. */
export interface QuickJoinFilters {
  sport: SportKey | "all"
  /** Max distance in km, or null for no limit. */
  maxDistanceKm: number | null
  day: "today" | "today-tomorrow"
  format: "Singles" | "Doubles" | "any"
  /** "my" = the user's current level, "any" = no level constraint, or a level. */
  level: "my" | "any" | Level
}

interface MatchmakingContextValue {
  rooms: MatchRoom[]
  joinedIds: Set<string>
  /** Rooms the user has joined or hosted. */
  joinedRooms: MatchRoom[]
  /** The most-recently joined/hosted room — what the topbar pill represents. */
  activeRoom: MatchRoom | null
  activeRoomId: string | null
  setActiveRoomId: (id: string) => void
  /** The user's self-declared level (mutable via the sidebar picker). */
  userLevel: Level
  setUserLevel: (level: Level) => void
  /** The in-progress Quick Match fallback search, or null. */
  search: PartnerSearch | null
  isSuitable: (room: MatchRoom) => boolean
  joinRoom: (room: MatchRoom, quick?: boolean) => void
  /** Leave a joined room; deletes the room outright if the user hosts it. */
  leaveRoom: (roomId: string) => void
  addRoom: (room: MatchRoom) => void
  quickJoin: (filters: QuickJoinFilters) => void
  /** Abort an in-progress search (creates nothing). */
  cancelSearch: () => void
  /** Dismiss the "room ready" dock (the room already exists). */
  dismissSearch: () => void
  /** Host control: set a room's capacity (clamped to [joined, 8]). */
  setRoomCapacity: (roomId: string, capacity: number) => void
  /** Host control: add a player to a room by initials (no-op if full). */
  invitePlayer: (roomId: string, initials: string) => void
  /** Whether the room-manager sheet is open (owned here so any surface can open it). */
  managerOpen: boolean
  setManagerOpen: (open: boolean) => void
  /** Open the manager sheet for a room (auto-open on create / dock "Manage"). */
  openManager: (roomId: string) => void
}

const MatchmakingContext = React.createContext<MatchmakingContextValue | null>(
  null
)

export function useMatchmaking() {
  const ctx = React.useContext(MatchmakingContext)
  if (!ctx) {
    throw new Error("useMatchmaking must be used within a MatchmakingProvider.")
  }
  return ctx
}

/** Add an hour to a "HH:MM" string for a simple one-hour slot. */
function plusHour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  const nh = (h + 1) % 24
  return `${String(nh).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`
}

/** Nearest court whose sports include the given sport. */
function courtFor(sport: SportKey): Court {
  return (
    [...COURTS]
      .filter((c) => c.sports.includes(sport))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? COURTS[0]
  )
}

/** Best faked partner: same level and sport preferred, then highest match %. */
function pickPartner(sport: SportKey, level: Level): Player {
  const pool = MATCH_SUGGESTIONS.filter((p) => p.initials !== USER.initials)
  return [...pool].sort((a, b) => {
    const score = (p: Player) =>
      (p.level === level ? 0 : 2) + (p.sport === sport ? 0 : 1)
    const d = score(a) - score(b)
    return d !== 0 ? d : b.matchPct - a.matchPct
  })[0]
}

/**
 * Owns the lobby list and the Quick Match partner search. Mounted in the
 * dashboard layout so the search (and its timers) survive navigation.
 */
export function MatchmakingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const [rooms, setRooms] = React.useState<MatchRoom[]>(ROOMS)
  const [joinedIds, setJoinedIds] = React.useState<Set<string>>(() => new Set())
  const [activeRoomId, setActiveRoomId] = React.useState<string | null>(null)
  const [userLevel, setUserLevel] = React.useState<Level>(USER.level)
  const [search, setSearch] = React.useState<PartnerSearch | null>(null)
  const [managerOpen, setManagerOpen] = React.useState(false)

  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const clock = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const idRef = React.useRef(0)

  const stopTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (clock.current) {
      clearInterval(clock.current)
      clock.current = null
    }
  }, [])

  // Tidy up any pending search timers when the dashboard unmounts.
  React.useEffect(() => stopTimers, [stopTimers])

  // Joinable = has an open seat and the user is not already in it. The skill
  // window check now lives in matchesQuickFilters (the Level filter).
  const isSuitable = (room: MatchRoom) =>
    room.joined < room.capacity && !joinedIds.has(room.id)

  const matchesQuickFilters = (room: MatchRoom, f: QuickJoinFilters) => {
    if (f.sport !== "all" && room.sport !== f.sport) return false
    if (f.maxDistanceKm !== null && room.distanceKm > f.maxDistanceKm)
      return false
    // Only rooms scheduled Today/Tomorrow are quick-joinable; any later-dated
    // room is excluded under both day options.
    const day = room.day.toLowerCase()
    if (f.day === "today" && day !== "today") return false
    if (f.day === "today-tomorrow" && day !== "today" && day !== "tomorrow")
      return false
    if (f.format !== "any" && room.format !== f.format) return false
    if (f.level === "any") return true
    const target = f.level === "my" ? userLevel : f.level
    return levelMatches(target, room.level)
  }

  const joinRoom = (room: MatchRoom, quick = false) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === room.id
          ? {
              ...r,
              joined: r.joined + 1,
              players: [...r.players, USER.initials],
            }
          : r
      )
    )
    setJoinedIds((prev) => new Set(prev).add(room.id))
    setActiveRoomId(room.id)
    const title = t.has(`rooms.${room.id}.title`)
      ? t(`rooms.${room.id}.title`)
      : room.title
    toast.success(quick ? t("toast.quickJoined") : t("toast.joined"), {
      description: `${title} · ${room.venue}`,
    })
  }

  const leaveRoom = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId)
    const hosting = room?.host.initials === USER.initials
    setRooms((prev) =>
      hosting
        ? prev.filter((r) => r.id !== roomId)
        : prev.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  joined: Math.max(0, r.joined - 1),
                  players: r.players.filter((p) => p !== USER.initials),
                }
              : r
          )
    )
    setJoinedIds((prev) => {
      const next = new Set(prev)
      next.delete(roomId)
      return next
    })
    // activeRoom falls back to the next joined room when this id no longer matches.
    setActiveRoomId((curr) => (curr === roomId ? null : curr))
    const title = t.has(`rooms.${roomId}.title`)
      ? t(`rooms.${roomId}.title`)
      : (room?.title ?? "")
    toast(t("toast.left"), { description: title })
  }

  const addRoom = (room: MatchRoom) => {
    setRooms((prev) => [room, ...prev])
    setJoinedIds((prev) => new Set(prev).add(room.id))
    setActiveRoomId(room.id)
  }

  const openManager = (roomId: string) => {
    setActiveRoomId(roomId)
    setManagerOpen(true)
  }

  const setRoomCapacity = (roomId: string, capacity: number) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              capacity: Math.max(r.joined, Math.min(MAX_CAPACITY, capacity)),
            }
          : r
      )
    )
  }

  const invitePlayer = (roomId: string, initials: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId &&
        r.joined < r.capacity &&
        !r.players.includes(initials)
          ? { ...r, joined: r.joined + 1, players: [...r.players, initials] }
          : r
      )
    )
  }

  /** Build the open seed room once a partner is found; returns its id. */
  const createSeedRoom = (
    opts: {
      sport: SportKey
      format: "Singles" | "Doubles"
      maxPlayers: number
    },
    partner: Player
  ): string => {
    const court = courtFor(opts.sport)
    const id = `r-mm-${idRef.current++}`
    addRoom({
      id,
      host: { name: USER.name, initials: USER.initials },
      title: t("matchmadeTitle", {
        sport: tc(`sports.${opts.sport}`),
        format: tc(`format.${opts.format.toLowerCase()}`),
      }),
      sport: opts.sport,
      format: opts.format,
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      day: "Today",
      time: `${court.nextSlot} – ${plusHour(court.nextSlot)}`,
      // The host (the user) declares the room at their own level.
      level: userLevel,
      capacity: opts.maxPlayers,
      joined: 2,
      players: [USER.initials, partner.initials],
      pricePerHour: court.pricePerHour,
    })
    openManager(id)
    return id
  }

  /** Quick Match fallback: search for one partner, then auto-create a room. */
  const startPartnerSearch = (filters: QuickJoinFilters) => {
    stopTimers()
    const sport = filters.sport === "all" ? "badminton" : filters.sport
    const format = filters.format === "any" ? "Doubles" : filters.format
    const maxPlayers = format === "Singles" ? 2 : 4
    setSearch({
      sport,
      format,
      maxPlayers,
      elapsed: 0,
      status: "searching",
      partner: null,
      roomId: null,
    })
    clock.current = setInterval(() => {
      setSearch((s) =>
        s && s.status === "searching" ? { ...s, elapsed: s.elapsed + 1 } : s
      )
    }, 1000)
    timers.current.push(
      setTimeout(() => {
        if (clock.current) {
          clearInterval(clock.current)
          clock.current = null
        }
        const partner = pickPartner(sport, userLevel)
        const roomId = createSeedRoom({ sport, format, maxPlayers }, partner)
        setSearch((s) =>
          s ? { ...s, status: "ready", partner: partner.initials, roomId } : s
        )
      }, SEARCH_MS)
    )
  }

  const quickJoin = (filters: QuickJoinFilters) => {
    const pool = rooms.filter(
      (r) => isSuitable(r) && matchesQuickFilters(r, filters)
    )
    if (pool.length) {
      const best = [...pool].sort((a, b) => {
        // Prefer rooms for the user's exact level over "any", then nearest, then fullest.
        const exact = (r: MatchRoom) => (r.level === userLevel ? 0 : 1)
        if (exact(a) !== exact(b)) return exact(a) - exact(b)
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.joined / b.capacity - a.joined / a.capacity
      })[0]
      joinRoom(best, true)
      return
    }
    startPartnerSearch(filters)
    toast(t("toast.noRoomTitle"), {
      description: t("toast.searchingPartner"),
    })
  }

  const endSearch = React.useCallback(() => {
    stopTimers()
    setSearch(null)
  }, [stopTimers])

  const joinedRooms = React.useMemo(
    () => rooms.filter((r) => joinedIds.has(r.id)),
    [rooms, joinedIds]
  )
  const activeRoom =
    joinedRooms.find((r) => r.id === activeRoomId) ?? joinedRooms[0] ?? null

  const value: MatchmakingContextValue = {
    rooms,
    joinedIds,
    joinedRooms,
    activeRoom,
    activeRoomId,
    setActiveRoomId,
    userLevel,
    setUserLevel,
    search,
    isSuitable,
    joinRoom,
    leaveRoom,
    addRoom,
    quickJoin,
    cancelSearch: endSearch,
    dismissSearch: endSearch,
    setRoomCapacity,
    invitePlayer,
    managerOpen,
    setManagerOpen,
    openManager,
  }

  return (
    <MatchmakingContext.Provider value={value}>
      {children}
    </MatchmakingContext.Provider>
  )
}

/**
 * Floating Quick Match dock. Fixed to the viewport so it stays put while the
 * user browses other dashboard pages during a search.
 */
export function MatchmakingDock() {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const { search, userLevel, cancelSearch, dismissSearch, openManager } =
    useMatchmaking()
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
                      )} · ${tc(`levels.${userLevel}`)}`}
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
