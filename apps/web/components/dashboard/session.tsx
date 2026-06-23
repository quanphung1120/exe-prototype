"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  BOOKING_DAYS,
  COURT_OPEN_FROM,
  COURT_OPEN_TO,
  activeRoster,
  capacityFor,
  durationOf,
  levelMatches,
  sessionToRoom,
  slotRange,
  type Booking,
  type Conflict,
  type Court,
  type CourtBand,
  type Level,
  type MatchRoom,
  type PlaySession,
  type Player,
  type Rsvp,
  type SessionPlayer,
  type SportKey,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useRouter } from "@/i18n/navigation"

/** The dedicated booking-wizard route the Play / book actions navigate to. */
const BOOK_PATH = "/dashboard/book"
/** Where a finished or abandoned booking lands when there's no history. */
const BOOKINGS_PATH = "/dashboard/bookings"

// How long the faked partner search runs before it finds someone.
const SEARCH_MS = 1800
// How long the faked payment "processes" before the court is booked.
const PAY_MS = 1700
// Largest room a host can grow to.
const MAX_CAPACITY = 8
// Most open rooms one player may host at once. Speculative rooms (Quick Match
// seeds + the Create Room dialog) count against this cap so a single player
// can't flood the matchmaking pool with junk rooms; paid solo court holds and
// opening your own booking to friends (addTeamToSession) are exempt because a
// real, paid court already backs them.
const MAX_HOSTED_ROOMS = 3
// How long a host (faked) takes to review + approve the user's join request.
const APPROVE_MS = 1600

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
  /** The player's editable display name (defaults to the seed user's name). */
  userName: string
  setUserName: (name: string) => void
  search: PartnerSearch | null
  // ── Derived projections (legacy shapes) ──
  rooms: MatchRoom[]
  joinedRooms: MatchRoom[]
  /** Rooms the user asked to join that are still awaiting host approval. */
  requestedIds: Set<string>
  /** Open rooms the user currently hosts (counts toward the anti-spam cap). */
  hostedRoomCount: number
  /** Ceiling on how many open rooms a single player may host at once. */
  maxHostedRooms: number
  /** Whether the user is under the cap and may open another room. */
  canHostMore: boolean
  activeRoom: MatchRoom | null
  activeSession: PlaySession | null
  activeRoomId: string | null
  setActiveRoomId: (id: string) => void
  bookings: Booking[]
  // ── Match Maker actions ──
  isSuitable: (room: MatchRoom) => boolean
  joinRoom: (room: MatchRoom) => void
  /** Host approves a player's join request → confirmed seat. */
  approveRequest: (sessionId: string, initials: string) => void
  /** Host declines a player's join request → dropped from the room. */
  declineRequest: (sessionId: string, initials: string) => void
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
  /** Arm the wizard without navigating (used by the book page on cold load). */
  armBooking: (
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
  pickSlot: (slot: string, durationMin: number) => void
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
  /** Booked blocks on the draft court/day (calendar). */
  courtBusy: CourtBand[]
  /** Tappable free gaps on the draft court/day (calendar). */
  courtGaps: CourtBand[]
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

/**
 * Keep a chosen start time inside the court's open window. The native `<input
 * type="time">` will happily yield values outside open hours (e.g. midnight
 * from the spinner), which would land the selection above/below the day
 * calendar and render an invisible band. Zero-padded "HH:MM" strings compare
 * lexicographically, so a string clamp is enough. Empty → null (no selection).
 */
function clampSlot(slot: string): string | null {
  if (!slot) return null
  if (slot < COURT_OPEN_FROM) return COURT_OPEN_FROM
  if (slot > COURT_OPEN_TO) return COURT_OPEN_TO
  return slot
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const tm = useTranslations("MatchMaker")
  const tb = useTranslations("Booking")
  const tc = useTranslations("Common")
  const ts = useTranslations("Session")
  const router = useRouter()

  // Records + record-bound helpers, served by the API via the DataProvider.
  const {
    courts: COURTS,
    players: MATCH_SUGGESTIONS,
    user: USER,
    sessions: SEED_SESSIONS,
    playerByInitials,
    courtByVenue,
    courtNumberFor,
    conflictFor,
    courtDayBusy,
    courtDayGaps,
    sessionToBooking,
  } = useData()

  /** Nearest court whose sports include the given sport. */
  const courtFor = (sport: SportKey): Court =>
    [...COURTS]
      .filter((c) => c.sports.includes(sport))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? COURTS[0]

  /** Faked partners: same level/sport preferred, then highest match %. */
  const pickPartners = (
    sport: SportKey,
    level: Level,
    count: number,
    exclude: string[]
  ): Player[] => {
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

  const [sessions, setSessions] = React.useState<PlaySession[]>(SEED_SESSIONS)
  const [joinedIds, setJoinedIds] = React.useState<Set<string>>(() => new Set())
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null
  )
  const [userLevel, setUserLevel] = React.useState<Level>(USER.level)
  const [userName, setUserName] = React.useState<string>(USER.name)
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

  // ── Timer pool (RSVP / search) keyed for targeted cleanup ──
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
  // Sessions the user has requested to join but isn't approved into yet.
  const requestedIds = React.useMemo(
    () =>
      new Set(
        sessions
          .filter(
            (s) =>
              s.roster.find((p) => p.initials === USER.initials)?.rsvp ===
              "requested"
          )
          .map((s) => s.id)
      ),
    [sessions, USER.initials]
  )
  // Open rooms the user hosts right now — the anti-spam cap counts these. Solo
  // court holds (listed:false) and finished/cancelled rooms are excluded, so the
  // cap only bounds rooms actively advertised in the matchmaking pool.
  const hostedRoomCount = React.useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.host.initials === USER.initials &&
          s.listed &&
          s.status !== "cancelled" &&
          s.status !== "completed"
      ).length,
    [sessions, USER.initials]
  )
  const canHostMore = hostedRoomCount < MAX_HOSTED_ROOMS

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
    [sessions, sessionToBooking]
  )

  const court = courtId ? (COURTS.find((c) => c.id === courtId) ?? null) : null
  const steps = courtless
    ? ["court", "slot", "confirm", "pay"]
    : ["slot", "confirm", "pay"]

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

  /** Localized room title (falls back to the stored title). */
  const roomTitle = (room: MatchRoom) =>
    tm.has(`rooms.${room.id}.title`) ? tm(`rooms.${room.id}.title`) : room.title

  /**
   * Faked host review of the user's join request: after a beat the host
   * reviews the user's reliability, clears them, and the seat confirms.
   */
  const scheduleHostApproval = (sessionId: string, hostName: string) => {
    const key = `approve:${sessionId}:${USER.initials}`
    const handle = setTimeout(() => {
      timers.current.delete(key)
      let approved = false
      let full = false
      setSessions((prev) => {
        const s = prev.find((x) => x.id === sessionId)
        if (!s || s.status === "cancelled") return prev
        const me = s.roster.find((p) => p.initials === USER.initials)
        if (!me || me.rsvp !== "requested") return prev
        // Re-check capacity at approval time, not just request time — the room
        // can fill between the request and this timer firing. Mirrors the manual
        // approveRequest guard so both paths enforce the same invariant. When the
        // room filled first, drop the request (like a host decline) rather than
        // confirm an over-capacity seat or leave a stuck "requested" pill.
        if (activeRoster(s).length >= s.capacity) {
          full = true
          return prev.map((x) =>
            x.id === sessionId
              ? {
                  ...x,
                  roster: x.roster.filter((p) => p.initials !== USER.initials),
                }
              : x
          )
        }
        approved = true
        return prev.map((x) =>
          x.id === sessionId
            ? {
                ...x,
                roster: x.roster.map((p) =>
                  p.initials === USER.initials
                    ? { ...p, rsvp: "going" as Rsvp }
                    : p
                ),
              }
            : x
        )
      })
      if (approved) {
        // Now (and only now) the user is a real member — grant joinedIds so the
        // team chat, notification, and active-room pill appear post-approval.
        setJoinedIds((prev) => new Set(prev).add(sessionId))
        toast.success(ts("toast.requestApproved"), { description: hostName })
      } else if (full) toast.error(ts("toast.full"))
    }, APPROVE_MS)
    timers.current.set(key, handle)
  }

  /** Ask to join someone else's room — the host approves before you're in. */
  const requestJoin = (room: MatchRoom) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === room.id &&
        activeRoster(s).length < s.capacity &&
        !s.roster.some((p) => p.initials === USER.initials)
          ? {
              ...s,
              roster: [
                ...s.roster,
                {
                  name: userName,
                  initials: USER.initials,
                  rsvp: "requested" as Rsvp,
                },
              ],
            }
          : s
      )
    )
    // Don't grant membership yet — the user is only "requested", not "joined".
    // joinedIds (and everything derived from it: the team chat, the "new chat"
    // notification, the active-room pill) is set in scheduleHostApproval once the
    // host actually approves. The "requested" state surfaces via requestedIds.
    setActiveSessionId(room.id)
    toast(tm("toast.requested"), {
      description: `${roomTitle(room)} · ${room.venue}`,
    })
    scheduleHostApproval(room.id, room.host.name)
  }

  const joinRoom = (room: MatchRoom) => {
    if (joinedIds.has(room.id)) {
      setActiveSessionId(room.id)
      setManagerOpen(true)
      return
    }
    // Already asked and awaiting the host — don't fire a second request (which
    // would re-toast and schedule a duplicate approval timer).
    if (requestedIds.has(room.id)) return
    requestJoin(room)
  }

  /** Host approves a join request → the requester takes a confirmed seat. */
  const approveRequest = (sessionId: string, initials: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return
    if (activeRoster(s).length >= s.capacity) {
      toast.error(ts("toast.full"))
      return
    }
    setSessions((prev) =>
      prev.map((x) => {
        if (x.id !== sessionId) return x
        const m = x.roster.find((p) => p.initials === initials)
        if (
          !m ||
          m.rsvp !== "requested" ||
          activeRoster(x).length >= x.capacity
        )
          return x
        return {
          ...x,
          roster: x.roster.map((p) =>
            p.initials === initials ? { ...p, rsvp: "going" as Rsvp } : p
          ),
        }
      })
    )
    toast.success(ts("toast.approved"), {
      description: playerByInitials(initials).name,
    })
  }

  /** Host declines a join request → the requester is dropped from the room. */
  const declineRequest = (sessionId: string, initials: string) => {
    setSessions((prev) =>
      prev.map((x) =>
        x.id === sessionId
          ? { ...x, roster: x.roster.filter((p) => p.initials !== initials) }
          : x
      )
    )
    toast(ts("toast.declined"), {
      description: playerByInitials(initials).name,
    })
  }

  /**
   * Faked "live" discovery: a couple of nearby players spot the user's open
   * room and ask to join, arriving staggered over a few seconds. They land as
   * `requested` so the host (the user) reviews their reliability and approves.
   */
  const scheduleJoinRequests = (session: PlaySession) => {
    const openSeats = session.capacity - activeRoster(session).length
    if (openSeats <= 0) return
    const exclude = session.roster.map((p) => p.initials)
    const askers = pickPartners(
      session.sport,
      userLevel,
      Math.min(openSeats, 2),
      exclude
    )
    askers.forEach((p, i) => {
      const key = `req:${session.id}:${p.initials}`
      const h = hash(`${session.id}:${p.initials}`)
      const delay = 2200 + i * 1600 + (h % 2200)
      const handle = setTimeout(() => {
        timers.current.delete(key)
        let asked = false
        setSessions((prev) => {
          const s = prev.find((x) => x.id === session.id)
          if (!s || s.status === "cancelled") return prev
          if (
            activeRoster(s).length >= s.capacity ||
            s.roster.some((r) => r.initials === p.initials)
          )
            return prev
          asked = true
          return prev.map((x) =>
            x.id === session.id
              ? {
                  ...x,
                  roster: [
                    ...x.roster,
                    {
                      name: p.name,
                      initials: p.initials,
                      rsvp: "requested" as Rsvp,
                    },
                  ],
                }
              : x
          )
        })
        if (asked) toast(ts("toast.joinRequest"), { description: p.name })
      }, delay)
      timers.current.set(key, handle)
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
    // Backstop the anti-spam cap (the dialog also guards before calling here).
    if (!canHostMore) {
      toast.error(tm("toast.limitTitle"), {
        description: tm("toast.limitBody", { max: MAX_HOSTED_ROOMS }),
      })
      return
    }
    const c = courtByVenue(room.venue)
    const next: PlaySession = {
      id: room.id,
      title: room.title,
      sport: room.sport,
      format: room.format,
      courtId: room.courtId ?? c?.id ?? null,
      dayKey: room.dayKey ?? "today",
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
    scheduleJoinRequests(next)
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
    [ts, playerByInitials]
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
      host: { name: userName, initials: USER.initials },
      capacity: opts.maxPlayers,
      roster: [
        { name: userName, initials: USER.initials, rsvp: "host" },
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
    scheduleJoinRequests(next)
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
      joinRoom(best)
      return
    }
    // No open room fits — Quick Match would spin up a fresh one, so it counts
    // against the hosted-room cap just like the Create Room dialog.
    if (!canHostMore) {
      toast.error(tm("toast.limitTitle"), {
        description: tm("toast.limitBody", { max: MAX_HOSTED_ROOMS }),
      })
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

  /**
   * Arm the booking wizard's state (court, day, draft, step) without leaving the
   * current page. The booking flow now lives on its own route, so navigation is
   * a separate concern: {@link openBooking} arms + pushes the route, while the
   * book page itself calls this on a cold load to default to a fresh, courtless
   * booking instead of showing a stale draft.
   */
  const armBooking = (
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
      // Carry the room's proposed start so the wizard pre-fills it (and surfaces
      // any conflict on that exact slot) instead of silently blanking it.
      slot: linked ? linked.slot : null,
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

  /** Arm the wizard and navigate to the dedicated booking page. */
  const openBooking = (
    cid: string | null,
    opts?: { roomId?: string; fillMode?: FillMode; invitees?: string[] }
  ) => {
    armBooking(cid, opts)
    router.push(BOOK_PATH)
  }

  /** Book a court for an existing forming room (active-session pill). */
  const bookCourtForSession = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return
    const cid = s.courtId ?? courtByVenue(s.venue)?.id ?? courtFor(s.sport).id
    openBooking(cid, { roomId: sessionId })
  }

  /**
   * Re-book a past/cancelled booking as a fresh solo court hold. The wizard no
   * longer gathers a team; the host grows the new booking into a room and
   * invites afterward (same as any fresh booking).
   */
  const rebookFrom = (bookingId: string) => {
    const s = sessions.find((x) => x.id === bookingId)
    if (!s) {
      openBooking(null)
      return
    }
    const cid = s.courtId ?? courtByVenue(s.venue)?.id ?? null
    openBooking(cid)
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
    // Return to wherever the wizard was opened from.
    router.back()
  }
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const setCourt = (cid: string) => {
    setCourtId(cid)
  }
  const setDay = (dayKey: string) =>
    setDraft((d) => ({ ...d, dayKey, slot: null }))
  const setSlot = (slot: string) =>
    setDraft((d) => ({ ...d, slot: clampSlot(slot) }))
  const setDuration = (durationMin: number) =>
    setDraft((d) => ({
      ...d,
      durationMin: Math.max(15, Math.min(300, durationMin)),
    }))
  /** Tap a free gap on the calendar: seed both the start and a fitting length. */
  const pickSlot = (slot: string, durationMin: number) =>
    setDraft((d) => ({
      ...d,
      slot: slot || null,
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

  // Calendar bands for the current draft court + day (live sessions): booked
  // blocks and the free gaps the player can tap to seed a start time.
  const courtBusy: CourtBand[] = court
    ? courtDayBusy(sessions, court.id, draft.dayKey, linkedId ?? undefined)
    : []
  const courtGaps: CourtBand[] = court
    ? courtDayGaps(sessions, court.id, draft.dayKey, linkedId ?? undefined)
    : []

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
      router.push(BOOKINGS_PATH)
      return
    }

    // New session, court-first — always a solo court hold. The host grows it
    // into a room (and invites players) afterward from the booking.
    const id = newId("bk")
    const host: SessionPlayer = {
      name: userName,
      initials: USER.initials,
      rsvp: "host",
    }
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
      host: { name: userName, initials: USER.initials },
      capacity: capacityFor(draft.format),
      roster: [host],
      level: userLevel,
      status: "booked",
      hold: "confirmed",
      listed: false,
      fillIntent: "court",
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      pricePerHour: court.pricePerHour,
    }
    setSessions((prev) => [next, ...prev])
    toast.success(tb("toast.booked"), {
      description: `${court.name} · ${dayLabel} · ${time}`,
    })
    setOpen(false)
    router.push(BOOKINGS_PATH)
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

  const value: SessionContextValue = {
    sessions,
    joinedIds,
    userLevel,
    setUserLevel,
    userName,
    setUserName,
    search,
    rooms,
    joinedRooms,
    requestedIds,
    hostedRoomCount,
    maxHostedRooms: MAX_HOSTED_ROOMS,
    canHostMore,
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
    approveRequest,
    declineRequest,
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
    armBooking,
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
    pickSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    paying,
    pay,
    confirmBooking,
    cancelBooking,
    slotBlocked,
    draftConflict,
    courtBusy,
    courtGaps,
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}
