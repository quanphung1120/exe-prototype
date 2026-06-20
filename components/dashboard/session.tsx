"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  BOOKING_DAYS,
  COURTS,
  MATCH_SUGGESTIONS,
  SESSIONS,
  USER,
  activeRoster,
  capacityFor,
  conflictFor,
  courtByVenue,
  courtNumberFor,
  durationOf,
  levelMatches,
  playerByInitials,
  sessionToBooking,
  sessionToRoom,
  slotRange,
  type Booking,
  type Conflict,
  type Court,
  type Level,
  type MatchRoom,
  type PlaySession,
  type Player,
  type Rsvp,
  type SessionPlayer,
  type SportKey,
} from "@/components/dashboard/data"

// How long the faked partner search runs before it finds someone.
const SEARCH_MS = 1800
// How long the faked payment "processes" before the court is booked.
const PAY_MS = 1700
// Largest room a host can grow to.
const MAX_CAPACITY = 8

/** Fill mode chosen at the "do you have a team yet?" gate. */
export type FillMode = "court" | "invite" | "find"

interface BookingDraft {
  dayKey: string
  slot: string | null
  /** Free-form session length in minutes (not tied to the hour). */
  durationMin: number
  format: "Singles" | "Doubles"
  fillMode: FillMode
  invitees: string[]
}

/** The faked Quick Match search shown in the floating dock. */
export interface PartnerSearch {
  sport: SportKey
  format: "Singles" | "Doubles"
  maxPlayers: number
  elapsed: number
  status: "searching" | "ready"
  partner: string | null
  roomId: string | null
}

/** Constraints the Quick Join popover applies to the auto-pick. */
export interface QuickJoinFilters {
  sport: SportKey | "all"
  courtId: string | null
  maxDistanceKm: number | null
  day: "today" | "today-tomorrow"
  format: "Singles" | "Doubles" | "any"
  level: "my" | "any" | Level
}

interface SessionContextValue {
  // ── Raw store ──
  sessions: PlaySession[]
  joinedIds: Set<string>
  userLevel: Level
  setUserLevel: (level: Level) => void
  search: PartnerSearch | null
  // ── Derived projections (legacy shapes) ──
  rooms: MatchRoom[]
  joinedRooms: MatchRoom[]
  activeRoom: MatchRoom | null
  activeSession: PlaySession | null
  activeRoomId: string | null
  setActiveRoomId: (id: string) => void
  bookings: Booking[]
  // ── Match Maker actions ──
  isSuitable: (room: MatchRoom) => boolean
  joinRoom: (room: MatchRoom, quick?: boolean) => void
  leaveRoom: (sessionId: string) => void
  addRoom: (room: MatchRoom) => void
  quickJoin: (filters: QuickJoinFilters) => void
  cancelSearch: () => void
  dismissSearch: () => void
  setRoomCapacity: (sessionId: string, capacity: number) => void
  invitePlayer: (sessionId: string, initials: string) => void
  kickPlayer: (sessionId: string, initials: string) => void
  fillRoom: (session: PlaySession) => void
  managerOpen: boolean
  setManagerOpen: (open: boolean) => void
  openManager: (sessionId: string) => void
  // ── Match Maker dialogs (triggered from the topbar) ──
  quickJoinOpen: boolean
  setQuickJoinOpen: (open: boolean) => void
  openQuickJoin: () => void
  createRoomOpen: boolean
  setCreateRoomOpen: (open: boolean) => void
  openCreateRoom: () => void
  // ── Play / booking wizard ──
  playOpen: boolean
  openPlay: () => void
  closePlay: () => void
  open: boolean
  courtId: string | null
  roomId: string | null
  court: Court | null
  steps: string[]
  step: number
  draft: BookingDraft
  capacityFor: (format: "Singles" | "Doubles") => number
  openBooking: (
    courtId: string | null,
    opts?: { roomId?: string; fillMode?: FillMode; invitees?: string[] }
  ) => void
  bookCourtForSession: (sessionId: string) => void
  addTeamToSession: (sessionId: string) => void
  rebookFrom: (bookingId: string) => void
  closeBooking: () => void
  next: () => void
  back: () => void
  setCourt: (courtId: string) => void
  setDay: (dayKey: string) => void
  setSlot: (slot: string) => void
  setDuration: (durationMin: number) => void
  setFormat: (format: "Singles" | "Doubles") => void
  setFillMode: (mode: FillMode) => void
  toggleInvite: (initials: string) => void
  /** Faked payment is processing (drives the Pay button + spinner). */
  paying: boolean
  /** Run the faked payment, then finalize the booking on success. */
  pay: () => void
  confirmBooking: () => void
  cancelBooking: (id: string) => void
  // ── Conflict (decision 2) ──
  slotBlocked: (slot: string) => boolean
  draftConflict: Conflict
  // ── Bill sharing (decision 7) ──
  payShare: (sessionId: string, initials: string) => void
}

const SessionContext = React.createContext<SessionContextValue | null>(null)

export function useSession() {
  const ctx = React.useContext(SessionContext)
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider.")
  }
  return ctx
}

const EMPTY_DRAFT: BookingDraft = {
  dayKey: "today",
  slot: null,
  durationMin: 60,
  format: "Doubles",
  fillMode: "court",
  invitees: [],
}

/** Tiny FNV-1a hash — deterministic RSVP timing without Date/random. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Nearest court whose sports include the given sport. */
function courtFor(sport: SportKey): Court {
  return (
    [...COURTS]
      .filter((c) => c.sports.includes(sport))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? COURTS[0]
  )
}

/** Faked partners: same level/sport preferred, then highest match %. */
function pickPartners(
  sport: SportKey,
  level: Level,
  count: number,
  exclude: string[]
): Player[] {
  const blocked = new Set([USER.initials, ...exclude])
  return [...MATCH_SUGGESTIONS]
    .filter((p) => !blocked.has(p.initials))
    .sort((a, b) => {
      const score = (p: Player) =>
        (p.level === level ? 0 : 2) + (p.sport === sport ? 0 : 1)
      const d = score(a) - score(b)
      return d !== 0 ? d : b.matchPct - a.matchPct
    })
    .slice(0, Math.max(0, count))
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const tm = useTranslations("MatchMaker")
  const tb = useTranslations("Booking")
  const tc = useTranslations("Common")
  const ts = useTranslations("Session")

  const [sessions, setSessions] = React.useState<PlaySession[]>(SESSIONS)
  const [joinedIds, setJoinedIds] = React.useState<Set<string>>(() => new Set())
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null
  )
  const [userLevel, setUserLevel] = React.useState<Level>(USER.level)
  const [search, setSearch] = React.useState<PartnerSearch | null>(null)
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [quickJoinOpen, setQuickJoinOpen] = React.useState(false)
  const [createRoomOpen, setCreateRoomOpen] = React.useState(false)

  const [playOpen, setPlayOpen] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [courtId, setCourtId] = React.useState<string | null>(null)
  const [linkedId, setLinkedId] = React.useState<string | null>(null)
  const [courtless, setCourtless] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<BookingDraft>(EMPTY_DRAFT)
  const [paying, setPaying] = React.useState(false)

  const idRef = React.useRef(0)
  const newId = (p: string) => `s-${p}-${idRef.current++}`

  // ── Timer pool (RSVP / bill / search) keyed for targeted cleanup ──
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  const clock = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const stopClock = React.useCallback(() => {
    if (clock.current) {
      clearInterval(clock.current)
      clock.current = null
    }
  }, [])

  /** Clear timers whose key matches the predicate. */
  const clearTimersFor = React.useCallback((sessionId: string) => {
    for (const [key, handle] of timers.current) {
      if (key.includes(`:${sessionId}:`)) {
        clearTimeout(handle)
        timers.current.delete(key)
      }
    }
  }, [])

  React.useEffect(() => {
    const pool = timers.current
    return () => {
      pool.forEach(clearTimeout)
      pool.clear()
      if (clock.current) clearInterval(clock.current)
    }
  }, [])

  // ── Derived projections ──
  const rooms = React.useMemo(
    () =>
      sessions
        .filter((s) => s.listed && s.status !== "cancelled")
        .map(sessionToRoom),
    [sessions]
  )
  const joinedSessions = React.useMemo(
    () =>
      sessions.filter(
        (s) =>
          joinedIds.has(s.id) &&
          s.status !== "cancelled" &&
          s.status !== "completed"
      ),
    [sessions, joinedIds]
  )
  const joinedRooms = React.useMemo(
    () => joinedSessions.map(sessionToRoom),
    [joinedSessions]
  )
  const activeSession =
    joinedSessions.find((s) => s.id === activeSessionId) ??
    joinedSessions[0] ??
    null
  const activeRoom = activeSession ? sessionToRoom(activeSession) : null
  const bookings = React.useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.status === "booked" ||
            s.status === "completed" ||
            s.status === "cancelled"
        )
        .map(sessionToBooking),
    [sessions]
  )

  const court = courtId ? (COURTS.find((c) => c.id === courtId) ?? null) : null
  const steps = courtless
    ? ["court", "slot", "players", "confirm", "pay"]
    : ["slot", "players", "confirm", "pay"]

  // ── Active-session helpers ──
  const announceActive = (next: string | null) => {
    if (next) {
      const s = sessions.find((x) => x.id === next)
      toast(ts("toast.activeNow", { title: s?.title ?? "" }))
    } else {
      toast(ts("toast.activeNone"))
    }
  }

  const dropJoined = (sessionId: string) => {
    setJoinedIds((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setActiveSessionId((curr) => (curr === sessionId ? null : curr))
  }

  // ── Match Maker actions ──
  const isSuitable = (room: MatchRoom) =>
    room.joined < room.capacity && !joinedIds.has(room.id)

  const matchesQuickFilters = (room: MatchRoom, f: QuickJoinFilters) => {
    if (f.sport !== "all" && room.sport !== f.sport) return false
    if (f.courtId) {
      const c = COURTS.find((x) => x.id === f.courtId)
      if (!c || room.venue !== c.name) return false
    }
    if (f.maxDistanceKm !== null && room.distanceKm > f.maxDistanceKm)
      return false
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
    if (joinedIds.has(room.id)) {
      setActiveSessionId(room.id)
      setManagerOpen(true)
      return
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === room.id && activeRoster(s).length < s.capacity
          ? {
              ...s,
              roster: [
                ...s.roster,
                {
                  name: USER.name,
                  initials: USER.initials,
                  rsvp: "going" as Rsvp,
                },
              ],
            }
          : s
      )
    )
    setJoinedIds((prev) => new Set(prev).add(room.id))
    setActiveSessionId(room.id)
    const title = tm.has(`rooms.${room.id}.title`)
      ? tm(`rooms.${room.id}.title`)
      : room.title
    toast.success(quick ? tm("toast.quickJoined") : tm("toast.joined"), {
      description: `${title} · ${room.venue}`,
    })
  }

  const leaveRoom = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return
    const hosting = s.host.initials === USER.initials
    clearTimersFor(sessionId)
    setSessions((prev) =>
      prev.flatMap((x) => {
        if (x.id !== sessionId) return [x]
        if (!hosting) {
          return [
            {
              ...x,
              roster: x.roster.filter((p) => p.initials !== USER.initials),
            },
          ]
        }
        // Host leaves: a booked room cancels its hold; a forming room disbands.
        if (x.status === "booked")
          return [{ ...x, status: "cancelled" as const, listed: false }]
        return []
      })
    )
    dropJoined(sessionId)
    const title = tm.has(`rooms.${sessionId}.title`)
      ? tm(`rooms.${sessionId}.title`)
      : (s.title ?? "")
    toast(
      hosting && s.status === "booked"
        ? ts("toast.disbanded")
        : tm("toast.left"),
      {
        description: title,
      }
    )
  }

  /** Convert a freshly-built MatchRoom (Create Room dialog) into a session. */
  const addRoom = (room: MatchRoom) => {
    const c = courtByVenue(room.venue)
    const next: PlaySession = {
      id: room.id,
      title: room.title,
      sport: room.sport,
      format: room.format,
      courtId: room.courtId ?? c?.id ?? null,
      dayKey: "today",
      dayLabel: room.day,
      slot: room.time ? room.time.split(" – ")[0] : null,
      durationMin: room.durationMin ?? durationOf(room.time),
      courtLabel: null,
      host: room.host,
      capacity: room.capacity,
      roster: room.players.map((init) => ({
        name: playerByInitials(init).name,
        initials: init,
        rsvp: (init === room.host.initials ? "host" : "going") as Rsvp,
      })),
      level: room.level,
      status: "forming",
      listed: true,
      fillIntent: "find",
      venue: room.venue,
      district: room.district,
      distanceKm: room.distanceKm,
      pricePerHour: room.pricePerHour,
    }
    setSessions((prev) => [next, ...prev])
    setJoinedIds((prev) => new Set(prev).add(room.id))
    setActiveSessionId(room.id)
  }

  const openManager = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setManagerOpen(true)
  }

  const setRoomCapacity = (sessionId: string, capacity: number) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              capacity: Math.max(
                activeRoster(s).length,
                Math.min(MAX_CAPACITY, capacity)
              ),
            }
          : s
      )
    )
  }

  /** Schedule the faked RSVP flips for freshly-invited members. */
  const scheduleRsvp = React.useCallback(
    (sessionId: string, inits: string[]) => {
      inits.forEach((init) => {
        const h = hash(`${sessionId}:${init}`)
        const declined = h % 5 === 0
        const delay = 1500 + (h % 4800)
        const key = `rsvp:${sessionId}:${init}`
        const handle = setTimeout(() => {
          timers.current.delete(key)
          setSessions((prev) => {
            const s = prev.find((x) => x.id === sessionId)
            if (!s || s.status === "cancelled") return prev
            const m = s.roster.find((p) => p.initials === init)
            if (!m || m.rsvp !== "pending") return prev
            return prev.map((x) =>
              x.id === sessionId
                ? {
                    ...x,
                    roster: x.roster.map((p) =>
                      p.initials === init
                        ? {
                            ...p,
                            rsvp: (declined ? "declined" : "going") as Rsvp,
                          }
                        : p
                    ),
                  }
                : x
            )
          })
          const name = playerByInitials(init).name
          toast(declined ? ts("toast.rsvpDeclined") : ts("toast.rsvpGoing"), {
            description: name,
          })
        }, delay)
        timers.current.set(key, handle)
      })
    },
    [ts]
  )

  const invitePlayer = (sessionId: string, initials: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    if (
      !s ||
      activeRoster(s).length >= s.capacity ||
      s.roster.some((p) => p.initials === initials)
    )
      return
    setSessions((prev) =>
      prev.map((x) =>
        x.id === sessionId && !x.roster.some((p) => p.initials === initials)
          ? {
              ...x,
              roster: [
                ...x.roster,
                {
                  name: playerByInitials(initials).name,
                  initials,
                  rsvp: "pending" as Rsvp,
                },
              ],
            }
          : x
      )
    )
    scheduleRsvp(sessionId, [initials])
  }

  const kickPlayer = (sessionId: string, initials: string) => {
    if (initials === USER.initials) return
    clearTimersFor(sessionId)
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, roster: s.roster.filter((p) => p.initials !== initials) }
          : s
      )
    )
  }

  /**
   * Faked search to fill an open room to capacity with distinct partners.
   * Takes the session object directly — when called right after creating it,
   * its `setSessions` write hasn't flushed, so reading it back would miss it.
   */
  const fillRoom = (session: PlaySession) => {
    const openSeats = session.capacity - activeRoster(session).length
    if (openSeats <= 0) return
    stopClock()
    setSearch({
      sport: session.sport,
      format: session.format,
      maxPlayers: session.capacity,
      elapsed: 0,
      status: "searching",
      partner: null,
      roomId: session.id,
    })
    clock.current = setInterval(() => {
      setSearch((cur) =>
        cur && cur.status === "searching"
          ? { ...cur, elapsed: cur.elapsed + 1 }
          : cur
      )
    }, 1000)
    const key = `fill:${session.id}:run`
    const handle = setTimeout(() => {
      timers.current.delete(key)
      stopClock()
      const exclude = session.roster.map((p) => p.initials)
      const partners = pickPartners(
        session.sport,
        userLevel,
        openSeats,
        exclude
      )
      setSessions((prev) =>
        prev.map((x) =>
          x.id === session.id
            ? {
                ...x,
                roster: [
                  ...x.roster,
                  ...partners.map((p) => ({
                    name: p.name,
                    initials: p.initials,
                    rsvp: "pending" as Rsvp,
                  })),
                ],
              }
            : x
        )
      )
      scheduleRsvp(
        session.id,
        partners.map((p) => p.initials)
      )
      setSearch((cur) =>
        cur
          ? {
              ...cur,
              status: "ready",
              partner: partners[0]?.initials ?? null,
              roomId: session.id,
            }
          : cur
      )
    }, SEARCH_MS)
    timers.current.set(key, handle)
  }

  /** Build a forming seed room once a Quick Match partner is found. */
  const createSeedRoom = (
    opts: {
      sport: SportKey
      format: "Singles" | "Doubles"
      maxPlayers: number
      court: Court
    },
    partner: Player
  ): string => {
    const { court: c } = opts
    const id = newId("mm")
    const next: PlaySession = {
      id,
      title: tm("matchmadeTitle", {
        sport: tc(`sports.${opts.sport}`),
        format: tc(`format.${opts.format.toLowerCase()}`),
      }),
      sport: opts.sport,
      format: opts.format,
      courtId: c.id,
      dayKey: "today",
      dayLabel: tc("when.today"),
      slot: c.nextSlot,
      durationMin: 60,
      courtLabel: null,
      host: { name: USER.name, initials: USER.initials },
      capacity: opts.maxPlayers,
      roster: [
        { name: USER.name, initials: USER.initials, rsvp: "host" },
        { name: partner.name, initials: partner.initials, rsvp: "going" },
      ],
      level: userLevel,
      status: "forming",
      listed: true,
      fillIntent: "find",
      venue: c.name,
      district: c.district,
      distanceKm: c.distanceKm,
      pricePerHour: c.pricePerHour,
    }
    setSessions((prev) => [next, ...prev])
    setJoinedIds((prev) => new Set(prev).add(id))
    setActiveSessionId(id)
    setManagerOpen(true)
    return id
  }

  const startPartnerSearch = (filters: QuickJoinFilters) => {
    stopClock()
    const chosen = filters.courtId
      ? COURTS.find((c) => c.id === filters.courtId)
      : null
    const sport =
      filters.sport !== "all"
        ? filters.sport
        : (chosen?.sports[0] ?? "badminton")
    const c = chosen ?? courtFor(sport)
    const format = filters.format === "any" ? "Doubles" : filters.format
    const maxPlayers = capacityFor(format)
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
      setSearch((cur) =>
        cur && cur.status === "searching"
          ? { ...cur, elapsed: cur.elapsed + 1 }
          : cur
      )
    }, 1000)
    const key = `quick:new:run`
    const handle = setTimeout(() => {
      timers.current.delete(key)
      stopClock()
      const partner = pickPartners(sport, userLevel, 1, [])[0]
      const roomId = createSeedRoom(
        { sport, format, maxPlayers, court: c },
        partner
      )
      setSearch((cur) =>
        cur
          ? { ...cur, status: "ready", partner: partner.initials, roomId }
          : cur
      )
    }, SEARCH_MS)
    timers.current.set(key, handle)
  }

  const quickJoin = (filters: QuickJoinFilters) => {
    const pool = rooms.filter(
      (r) => isSuitable(r) && matchesQuickFilters(r, filters)
    )
    if (pool.length) {
      const best = [...pool].sort((a, b) => {
        const exact = (r: MatchRoom) => (r.level === userLevel ? 0 : 1)
        if (exact(a) !== exact(b)) return exact(a) - exact(b)
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.joined / b.capacity - a.joined / a.capacity
      })[0]
      joinRoom(best, true)
      return
    }
    startPartnerSearch(filters)
    toast(tm("toast.noRoomTitle"), {
      description: tm("toast.searchingPartner"),
    })
  }

  const endSearch = () => {
    if (search && search.status === "searching") {
      // cancel: clear the pending run so no room is created
      for (const [key, handle] of timers.current) {
        if (key.startsWith("quick:") || key.startsWith("fill:")) {
          clearTimeout(handle)
          timers.current.delete(key)
        }
      }
    }
    stopClock()
    setSearch(null)
  }

  // ── Play / booking wizard ──
  const openPlay = () => setPlayOpen(true)
  const closePlay = () => setPlayOpen(false)

  const openBooking = (
    cid: string | null,
    opts?: { roomId?: string; fillMode?: FillMode; invitees?: string[] }
  ) => {
    const rid = opts?.roomId ?? null
    const linked = rid ? (sessions.find((s) => s.id === rid) ?? null) : null
    setPlayOpen(false)
    setCourtId(cid)
    setLinkedId(rid)
    setCourtless(cid === null)
    setStep(0)
    setPaying(false)
    setDraft({
      dayKey: linked ? linked.dayKey : "today",
      slot: null,
      durationMin: linked ? linked.durationMin : 60,
      format: linked?.format ?? "Doubles",
      fillMode: linked ? "court" : (opts?.fillMode ?? "court"),
      invitees: linked
        ? activeRoster(linked)
            .map((p) => p.initials)
            .filter((p) => p !== USER.initials)
        : (opts?.invitees ?? []),
    })
    setOpen(true)
  }

  /** Book a court for an existing forming room (active-session pill). */
  const bookCourtForSession = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return
    const cid = s.courtId ?? courtByVenue(s.venue)?.id ?? courtFor(s.sport).id
    openBooking(cid, { roomId: sessionId })
  }

  /** Re-book a past/cancelled booking as a fresh session (clone court+team). */
  const rebookFrom = (bookingId: string) => {
    const s = sessions.find((x) => x.id === bookingId)
    if (!s) {
      openBooking(null)
      return
    }
    const invitees = activeRoster(s)
      .map((p) => p.initials)
      .filter((p) => p !== USER.initials)
    const cid = s.courtId ?? courtByVenue(s.venue)?.id ?? null
    openBooking(cid, {
      fillMode: invitees.length ? "invite" : "court",
      invitees,
    })
    setDraft((d) => ({ ...d, format: s.format }))
  }

  /** Open a booked solo session to add a team (decision 5). */
  const addTeamToSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, listed: true, fillIntent: "invite" } : s
      )
    )
    setJoinedIds((prev) => new Set(prev).add(sessionId))
    setActiveSessionId(sessionId)
    setManagerOpen(true)
    toast(ts("toast.addTeam"))
  }

  const closeBooking = () => {
    // Abandon any in-flight faked payment so a stale timer can't fire.
    const handle = timers.current.get("pay:new:run")
    if (handle) {
      clearTimeout(handle)
      timers.current.delete("pay:new:run")
    }
    setPaying(false)
    setOpen(false)
  }
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const setCourt = (cid: string) => {
    setCourtId(cid)
    setDraft((d) => ({ ...d, slot: null }))
  }
  const setDay = (dayKey: string) =>
    setDraft((d) => ({ ...d, dayKey, slot: null }))
  const setSlot = (slot: string) =>
    setDraft((d) => ({ ...d, slot: slot || null }))
  const setDuration = (durationMin: number) =>
    setDraft((d) => ({
      ...d,
      durationMin: Math.max(15, Math.min(300, durationMin)),
    }))
  const setFormat = (format: "Singles" | "Doubles") =>
    setDraft((d) => ({
      ...d,
      format,
      invitees: d.invitees.slice(0, capacityFor(format) - 1),
    }))
  const setFillMode = (fillMode: FillMode) =>
    setDraft((d) => ({ ...d, fillMode }))
  const toggleInvite = (initials: string) =>
    setDraft((d) => {
      if (d.invitees.includes(initials))
        return { ...d, invitees: d.invitees.filter((i) => i !== initials) }
      if (d.invitees.length >= capacityFor(d.format) - 1) return d
      return { ...d, invitees: [...d.invitees, initials] }
    })

  const slotBlocked = (slot: string) =>
    court
      ? conflictFor(sessions, {
          courtId: court.id,
          dayKey: draft.dayKey,
          slot,
          durationMin: draft.durationMin,
          ignoreId: linkedId ?? undefined,
        }) !== null
      : false

  const draftConflict: Conflict =
    court && draft.slot
      ? conflictFor(sessions, {
          courtId: court.id,
          dayKey: draft.dayKey,
          slot: draft.slot,
          durationMin: draft.durationMin,
          ignoreId: linkedId ?? undefined,
        })
      : null

  const confirmBooking = () => {
    if (!court || !draft.slot) return
    const q = {
      courtId: court.id,
      dayKey: draft.dayKey,
      slot: draft.slot,
      durationMin: draft.durationMin,
      ignoreId: linkedId ?? undefined,
    }
    if (conflictFor(sessions, q)) {
      toast.error(tb("toast.conflict"))
      return
    }
    const dayLabel =
      BOOKING_DAYS.find((d) => d.key === draft.dayKey)?.label ?? "Today"
    const time = slotRange(draft.slot, draft.durationMin)
    const linked = linkedId ? sessions.find((s) => s.id === linkedId) : null
    const sport = linked?.sport ?? court.sports[0]
    const courtLabel = courtNumberFor(court.id)

    if (linked) {
      // Transition an existing forming room into a booked one.
      setSessions((prev) =>
        prev.map((s) =>
          s.id === linked.id
            ? {
                ...s,
                status: "booked",
                hold: "confirmed",
                courtId: court.id,
                courtLabel,
                dayKey: draft.dayKey,
                dayLabel,
                slot: draft.slot,
                durationMin: draft.durationMin,
                venue: court.name,
                district: court.district,
                distanceKm: court.distanceKm,
                pricePerHour: court.pricePerHour,
              }
            : s
        )
      )
      toast.success(tb("toast.booked"), {
        description: `${court.name} · ${dayLabel} · ${time}`,
      })
      setOpen(false)
      setManagerOpen(true)
      return
    }

    // New session, court-first.
    const id = newId("bk")
    const host: SessionPlayer = {
      name: USER.name,
      initials: USER.initials,
      rsvp: "host",
    }
    const listed = draft.fillMode !== "court"
    const roster: SessionPlayer[] =
      draft.fillMode === "invite"
        ? [
            host,
            ...draft.invitees.map((init) => ({
              name: playerByInitials(init).name,
              initials: init,
              rsvp: "pending" as Rsvp,
            })),
          ]
        : [host]
    const next: PlaySession = {
      id,
      title: tb("roomTitle", {
        sport: tc(`sports.${sport}`),
        court: court.name,
      }),
      sport,
      format: draft.format,
      courtId: court.id,
      dayKey: draft.dayKey,
      dayLabel,
      slot: draft.slot,
      durationMin: draft.durationMin,
      courtLabel,
      host: { name: USER.name, initials: USER.initials },
      capacity: capacityFor(draft.format),
      roster,
      level: userLevel,
      status: "booked",
      hold: "confirmed",
      listed,
      fillIntent: draft.fillMode,
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      pricePerHour: court.pricePerHour,
    }
    setSessions((prev) => [next, ...prev])
    if (listed) {
      setJoinedIds((prev) => new Set(prev).add(id))
      setActiveSessionId(id)
    }
    if (draft.fillMode === "invite") scheduleRsvp(id, draft.invitees)
    if (draft.fillMode === "find") fillRoom(next)
    toast.success(tb("toast.booked"), {
      description: `${court.name} · ${dayLabel} · ${time}`,
    })
    setOpen(false)
  }

  /**
   * Faked card/QR payment: spin for a beat, then run the real booking
   * finalize. The court is only held once "payment" clears.
   */
  const pay = () => {
    if (!court || !draft.slot || paying) return
    // Never charge for a slot that was taken in the meantime.
    if (draftConflict) {
      toast.error(tb("toast.conflict"))
      return
    }
    setPaying(true)
    const key = "pay:new:run"
    const handle = setTimeout(() => {
      timers.current.delete(key)
      setPaying(false)
      confirmBooking()
    }, PAY_MS)
    timers.current.set(key, handle)
  }

  const cancelBooking = (id: string) => {
    const s = sessions.find((x) => x.id === id)
    if (!s) return
    if (s.listed) {
      // Keep the team's room open, drop the court hold (revert to forming).
      setSessions((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status: "forming",
                hold: undefined,
                courtLabel: null,
                slot: null,
              }
            : x
        )
      )
    } else {
      clearTimersFor(id)
      setSessions((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x))
      )
      dropJoined(id)
    }
    toast(tb("toast.cancelled"), { description: s.venue })
  }

  // ── Bill sharing ──
  const payShare = (sessionId: string, initials: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              roster: s.roster.map((p) =>
                p.initials === initials ? { ...p, paid: true } : p
              ),
            }
          : s
      )
    )
    toast(ts("toast.billPaid"), {
      description: playerByInitials(initials).name,
    })
    // When you settle up, the rest of the team follows over the next moments.
    if (initials === USER.initials) {
      const s = sessions.find((x) => x.id === sessionId)
      if (!s) return
      const owing = activeRoster(s).filter(
        (p) => p.initials !== USER.initials && !p.paid
      )
      owing.forEach((p, i) => {
        const key = `bill:${sessionId}:${p.initials}`
        const handle = setTimeout(
          () => {
            timers.current.delete(key)
            setSessions((prev) => {
              const cur = prev.find((x) => x.id === sessionId)
              if (!cur || cur.status === "cancelled") return prev
              return prev.map((x) =>
                x.id === sessionId
                  ? {
                      ...x,
                      roster: x.roster.map((m) =>
                        m.initials === p.initials ? { ...m, paid: true } : m
                      ),
                    }
                  : x
              )
            })
            toast(ts("toast.billPaid"), { description: p.name })
          },
          1200 + i * 1100
        )
        timers.current.set(key, handle)
      })
    }
  }

  const value: SessionContextValue = {
    sessions,
    joinedIds,
    userLevel,
    setUserLevel,
    search,
    rooms,
    joinedRooms,
    activeRoom,
    activeSession,
    activeRoomId: activeSession?.id ?? null,
    setActiveRoomId: (id) => {
      setActiveSessionId(id)
      announceActive(id)
    },
    bookings,
    isSuitable,
    joinRoom,
    leaveRoom,
    addRoom,
    quickJoin,
    cancelSearch: endSearch,
    dismissSearch: endSearch,
    setRoomCapacity,
    invitePlayer,
    kickPlayer,
    fillRoom,
    managerOpen,
    setManagerOpen,
    openManager,
    quickJoinOpen,
    setQuickJoinOpen,
    openQuickJoin: () => setQuickJoinOpen(true),
    createRoomOpen,
    setCreateRoomOpen,
    openCreateRoom: () => setCreateRoomOpen(true),
    playOpen,
    openPlay,
    closePlay,
    open,
    courtId,
    roomId: linkedId,
    court,
    steps,
    step,
    draft,
    capacityFor,
    openBooking,
    bookCourtForSession,
    addTeamToSession,
    rebookFrom,
    closeBooking,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setDuration,
    setFormat,
    setFillMode,
    toggleInvite,
    paying,
    pay,
    confirmBooking,
    cancelBooking,
    slotBlocked,
    draftConflict,
    payShare,
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}
