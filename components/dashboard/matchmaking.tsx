"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { Check, Clock, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  COURTS,
  ROOMS,
  USER,
  skillWindow,
  sportLabel,
  type MatchRoom,
  type SportKey,
} from "@/components/dashboard/data"

// Cadence of the faked matchmaking search (one seat fills per tick).
const SEAT_MS = 1500

/** Active matchmaking search shown in the floating dock. */
export interface Queue {
  sport: SportKey
  format: "Singles" | "Doubles"
  capacity: number
  found: number
  elapsed: number
  matched: boolean
}

interface MatchmakingContextValue {
  rooms: MatchRoom[]
  joinedIds: Set<string>
  queue: Queue | null
  isSuitable: (room: MatchRoom) => boolean
  joinRoom: (room: MatchRoom, quick?: boolean) => void
  addRoom: (room: MatchRoom) => void
  quickJoin: (sport: SportKey | "all") => void
  cancelQueue: () => void
  acceptMatch: () => void
}

const MatchmakingContext =
  React.createContext<MatchmakingContextValue | null>(null)

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

/**
 * Owns the lobby list and the matchmaking queue. Mounted in the dashboard
 * layout so the queue (and its timers) survive navigation between pages.
 */
export function MatchmakingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [rooms, setRooms] = React.useState<MatchRoom[]>(ROOMS)
  const [joinedIds, setJoinedIds] = React.useState<Set<string>>(() => new Set())
  const [queue, setQueue] = React.useState<Queue | null>(null)

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

  const isSuitable = (room: MatchRoom) =>
    USER.rating >= room.skillMin &&
    USER.rating <= room.skillMax &&
    room.joined < room.capacity &&
    !joinedIds.has(room.id)

  const joinRoom = (room: MatchRoom, quick = false) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === room.id
          ? { ...r, joined: r.joined + 1, players: [...r.players, USER.initials] }
          : r
      )
    )
    setJoinedIds((prev) => new Set(prev).add(room.id))
    toast.success(quick ? "Quick joined a room" : "You're in", {
      description: `${room.title} · ${room.venue}`,
    })
  }

  const addRoom = (room: MatchRoom) => {
    setRooms((prev) => [room, ...prev])
    setJoinedIds((prev) => new Set(prev).add(room.id))
  }

  const startQueue = (forSport: SportKey) => {
    stopTimers()
    const capacity = 4
    setQueue({
      sport: forSport,
      format: "Doubles",
      capacity,
      found: 1,
      elapsed: 0,
      matched: false,
    })
    clock.current = setInterval(() => {
      setQueue((q) => (q && !q.matched ? { ...q, elapsed: q.elapsed + 1 } : q))
    }, 1000)
    for (let seat = 2; seat <= capacity; seat++) {
      const last = seat === capacity
      timers.current.push(
        setTimeout(() => {
          setQueue((q) => (q ? { ...q, found: seat, matched: last } : q))
          if (last && clock.current) {
            clearInterval(clock.current)
            clock.current = null
          }
        }, (seat - 1) * SEAT_MS)
      )
    }
  }

  const quickJoin = (sport: SportKey | "all") => {
    const visible = rooms.filter((r) => sport === "all" || r.sport === sport)
    const pool = visible.filter(isSuitable)
    if (pool.length) {
      const best = [...pool].sort((a, b) => {
        const am = Math.abs((a.skillMin + a.skillMax) / 2 - USER.rating)
        const bm = Math.abs((b.skillMin + b.skillMax) / 2 - USER.rating)
        if (am !== bm) return am - bm
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.joined / b.capacity - a.joined / a.capacity
      })[0]
      joinRoom(best, true)
      return
    }
    startQueue(sport === "all" ? "padel" : sport)
    toast("No open room fits — finding you a match", {
      description: "Hang tight, we're filling a lobby for you.",
    })
  }

  const acceptMatch = () => {
    if (!queue) return
    stopTimers()
    const court = COURTS.find((c) => c.sports.includes(queue.sport)) ?? COURTS[0]
    const [skillMin, skillMax] = skillWindow("my-level", USER.rating)
    const fill = ["TH", "LL", "ĐA", "BK", "VH"].filter((i) => i !== USER.initials)
    addRoom({
      id: `r-mm-${idRef.current++}`,
      host: { name: USER.name, initials: USER.initials },
      title: `Matchmade ${sportLabel(queue.sport).toLowerCase()} ${queue.format.toLowerCase()}`,
      sport: queue.sport,
      format: queue.format,
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      day: "Today",
      time: `${court.nextSlot} – ${plusHour(court.nextSlot)}`,
      skillMin,
      skillMax,
      capacity: queue.capacity,
      joined: queue.capacity,
      players: [USER.initials, ...fill].slice(0, queue.capacity),
      pricePerHour: court.pricePerHour,
    })
    toast.success("Match ready!", {
      description: `${queue.capacity} players · ${court.name}`,
    })
    setQueue(null)
  }

  const cancelQueue = () => {
    stopTimers()
    setQueue(null)
  }

  const value: MatchmakingContextValue = {
    rooms,
    joinedIds,
    queue,
    isSuitable,
    joinRoom,
    addRoom,
    quickJoin,
    cancelQueue,
    acceptMatch,
  }

  return (
    <MatchmakingContext.Provider value={value}>
      {children}
    </MatchmakingContext.Provider>
  )
}

/**
 * Floating matchmaking status dock. Fixed to the viewport so it stays put
 * while the user browses other dashboard pages during a search.
 */
export function MatchmakingDock() {
  const { queue, cancelQueue, acceptMatch } = useMatchmaking()

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
      <AnimatePresence>
        {queue ? (
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
                {queue.matched ? (
                  <Check className="size-4" />
                ) : (
                  <Loader2 className="size-4 animate-spin" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-none font-semibold">
                  {queue.matched ? "Match ready" : "Finding players…"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {sportLabel(queue.sport)} · {queue.format} · ~
                  {USER.rating.toFixed(1)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {Array.from({ length: queue.capacity }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-2 rounded-full transition-colors",
                        i < queue.found ? "bg-brand" : "bg-muted-foreground/25"
                      )}
                    />
                  ))}
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {queue.found}/{queue.capacity}
                </span>
              </div>

              <span className="hidden items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums sm:inline-flex">
                <Clock className="size-3.5" />
                {Math.floor(queue.elapsed / 60)}:
                {String(queue.elapsed % 60).padStart(2, "0")}
              </span>

              <div className="ml-auto flex items-center gap-2">
                {queue.matched ? (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={acceptMatch}
                  >
                    Accept
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  aria-label="Cancel search"
                  onClick={cancelQueue}
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
