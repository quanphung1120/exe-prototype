"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  COURT_OPEN_FROM,
  COURT_OPEN_TO,
  activeRoster,
  addDaysIso,
  capacityFor,
  durationOf,
  levelMatches,
  locStr,
  priceFor,
  rangesOverlap,
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
  type RoomLevel,
  type SessionPlayer,
  type SportKey,
} from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import { useRouter } from "@/i18n/navigation"
import { useAuthUser } from "@/features/dashboard/auth-user"
import {
  PLAYER_ASSESSMENT_UPDATED_EVENT,
  levelsBySport,
  readStoredAssessment,
  type AssessmentSport,
} from "@/features/assessment/player-assessment"
import { saveSession } from "@/features/play/session-actions"
import {
  addRoomMember,
  createRoomChat,
  freezeRoomChat,
  removeRoomMember,
} from "@/features/chat/stream-actions"

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
// Once a court+slot is picked (still forming, not yet paid), the slot is held
// this long before it's released back for others to book.
const HOLD_MS = 20 * 60 * 1000
// A join request the host hasn't answered auto-expires after this long.
const REQUEST_EXPIRY_MS = 2 * 60 * 60 * 1000
// An invite a player hasn't responded to auto-expires after this long.
const INVITE_EXPIRY_MS = 6 * 60 * 60 * 1000

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

type PaymentResult =
  | {
      status: "success"
      amount: number
    }
  | {
      status: "failed"
      amount: number
      reason: "declined" | "conflict"
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

/** A court hold or join-request/invite that auto-expired — for notifications. */
export interface ExpiredEvent {
  id: string
  kind: "hold" | "request" | "invite"
  title: string
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
  userLevels: Record<AssessmentSport, Level>
  userLevelForSport: (sport: SportKey) => Level
  /** The player's editable display name (defaults to the seed user's name). */
  userName: string
  setUserName: (name: string) => void
  search: PartnerSearch | null
  /** Court holds / join-requests / invites that auto-expired (for notifications). */
  expiredEvents: ExpiredEvent[]
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
  /**
   * Whether joining `room` would double-book the player against a game they're
   * already committed to (same day, overlapping slot). The join button reads
   * this to disable itself so overlapping rooms can't be requested in the first
   * place — {@link joinRoom} enforces the same rule as a backstop.
   */
  hasTimeConflict: (room: MatchRoom) => boolean
  joinRoom: (room: MatchRoom) => void
  /** Host approves a player's join request → confirmed seat. */
  approveRequest: (sessionId: string, initials: string) => void
  /** Host declines a player's join request → dropped from the room. */
  declineRequest: (sessionId: string, initials: string) => void
  leaveRoom: (sessionId: string) => void
  addRoom: (room: MatchRoom) => void
  createInviteRoom: (input: {
    title: string
    sport: SportKey
    format: "Singles" | "Doubles"
    courtId?: string | null
    venue: string
    district: string
    distanceKm: number
    dayKey: string
    dayLabel: string
    slot: string
    durationMin: number
    level: RoomLevel
    pricePerHour: number
    invitees: string[]
  }) => string | null
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
  addPlayersToSession: (sessionId: string, initials: string[]) => number
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
  paymentResult: PaymentResult | null
  /** Run the faked payment, then finalize the booking on success. */
  pay: () => void
  acknowledgePaymentSuccess: () => void
  dismissPaymentResult: () => void
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

function emptyDraft(todayIso: string): BookingDraft {
  return {
    dayKey: todayIso,
    slot: null,
    durationMin: 60,
    format: "Doubles",
    fillMode: "court",
    invitees: [],
  }
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
  const locale = useLocale()

  // Records + record-bound helpers, served by the API via the DataProvider.
  const {
    courts: COURTS,
    players: MATCH_SUGGESTIONS,
    user: USER,
    sessions: SEED_SESSIONS,
    todayIso,
    dayLabelFor,
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
  const [fallbackUserLevel, setFallbackUserLevel] =
    React.useState<Level>(USER.level)
  const [assessmentLevels, setAssessmentLevels] = React.useState<
    Record<AssessmentSport, Level>
  >(() => levelsBySport(null, USER.level))
  const authUser = useAuthUser()
  const [userName, setUserName] = React.useState<string>(
    () => authUser.name || USER.name
  )
  const [search, setSearch] = React.useState<PartnerSearch | null>(null)
  const [expiredEvents, setExpiredEvents] = React.useState<ExpiredEvent[]>([])
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [quickJoinOpen, setQuickJoinOpen] = React.useState(false)
  const [createRoomOpen, setCreateRoomOpen] = React.useState(false)

  const [playOpen, setPlayOpen] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [courtId, setCourtId] = React.useState<string | null>(null)
  const [linkedId, setLinkedId] = React.useState<string | null>(null)
  const [courtless, setCourtless] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<BookingDraft>(() =>
    emptyDraft(todayIso)
  )
  const [paying, setPaying] = React.useState(false)
  const [paymentResult, setPaymentResult] =
    React.useState<PaymentResult | null>(null)
  const [payAttempts, setPayAttempts] = React.useState(0)

  // Cross-surface flow-back: the provider seeds its `sessions` once, so an
  // operator's approve/decline (persisted to the same DB) wouldn't otherwise
  // appear here. When a fresh seed arrives (the Bookings view calls
  // `router.refresh()` on mount), adopt the server's terminal status/hold/
  // decline/refund for each booked/cancelled session — but never clobber an
  // in-flight `forming` lobby or an active court hold.
  const seedRef = React.useRef(SEED_SESSIONS)
  React.useEffect(() => {
    if (SEED_SESSIONS === seedRef.current) return
    seedRef.current = SEED_SESSIONS
    const byId = new Map(SEED_SESSIONS.map((s) => [s.id, s]))
    setSessions((prev) =>
      prev.map((local) => {
        const server = byId.get(local.id)
        if (!server) return local
        if (local.status === "forming" || local.holdExpiresAt) return local
        if (
          server.status === local.status &&
          server.hold === local.hold &&
          server.cancelReason === local.cancelReason &&
          server.refunded === local.refunded
        )
          return local
        return {
          ...local,
          status: server.status,
          hold: server.hold,
          cancelReason: server.cancelReason,
          refunded: server.refunded,
        }
      })
    )
  }, [SEED_SESSIONS])

  // A per-mount base keeps generated ids unique across reloads: the counter
  // resets to 0 on every mount, so without a base a new session could reuse an
  // old counter value and clobber a persisted session sharing that id. Seeded
  // in an effect (not during render) since it draws on Date.now()/random, and
  // newId only ever runs from event handlers — well after mount.
  const idBase = React.useRef<string | null>(null)
  React.useEffect(() => {
    idBase.current ??= `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`
  }, [])
  const idRef = React.useRef(0)
  const newId = (p: string) =>
    `s-${p}-${idBase.current ?? "0"}-${idRef.current++}`

  // Mirror a user-owned session to MongoDB so it survives refresh/restart (see
  // lib/session-actions). Fire-and-forget: the client `sessions` array is the
  // optimistic source of truth, so a failed write only forfeits durability and
  // never blocks or reverts the UI.
  const persist = (session: PlaySession) => {
    void saveSession(session).catch((err: unknown) => {
      console.error("Failed to persist session", err)
    })
  }

  // ── Real room-chat lifecycle (quyết định #13) ──────────────────────────
  // Every call here is fire-and-forget: a Stream hiccup must never block a
  // matchmaking/booking action, so failures are swallowed (logged) rather
  // than surfaced — the UI already reflects the session change optimistically.

  /** Create the room's real chat (host-only, no mocks) right when it's made. */
  const openRoomChat = (sessionId: string, title: string) => {
    void createRoomChat({ roomId: sessionId, name: title }).catch(
      (err: unknown) => {
        console.error("Failed to create room chat", err)
      }
    )
  }

  /**
   * Add a real (non-mock) member to a room's chat, e.g. once the host approves
   * their join request. Mock players (the entire `MATCH_SUGGESTIONS` pool)
   * aren't Stream users under this real lifecycle — `ensureRoomChannel`'s
   * mock-seeding (still used until Phase 9) covers them when chat opens.
   */
  const addRealRoomMember = (sessionId: string, initials: string) => {
    if (MATCH_SUGGESTIONS.some((p) => p.initials === initials)) return
    void addRoomMember({ roomId: sessionId, memberId: initials }).catch(
      (err: unknown) => {
        console.error("Failed to add room member", err)
      }
    )
  }

  /**
   * Remove a member from a room's chat — host kick/decline (by initials) or a
   * member leaving themselves (by their real Stream/Clerk id, which never
   * collides with a mock's 2-3 letter initials, so it always passes the guard).
   */
  const removeRealRoomMember = (sessionId: string, memberId: string) => {
    if (MATCH_SUGGESTIONS.some((p) => p.initials === memberId)) return
    void removeRoomMember({ roomId: sessionId, memberId }).catch(
      (err: unknown) => {
        console.error("Failed to remove room member", err)
      }
    )
  }

  /** Host freezes a room's chat on cancel — keeps history, blocks sends. */
  const freezeRoomChatBestEffort = (sessionId: string) => {
    void freezeRoomChat(sessionId).catch((err: unknown) => {
      console.error("Failed to freeze room chat", err)
    })
  }

  React.useEffect(() => {
    const syncAssessment = () => {
      setAssessmentLevels(
        levelsBySport(readStoredAssessment(), fallbackUserLevel)
      )
    }
    syncAssessment()
    window.addEventListener("storage", syncAssessment)
    window.addEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, syncAssessment)
    return () => {
      window.removeEventListener("storage", syncAssessment)
      window.removeEventListener(
        PLAYER_ASSESSMENT_UPDATED_EVENT,
        syncAssessment
      )
    }
  }, [fallbackUserLevel])

  const userLevelForSport = React.useCallback(
    (sport: SportKey): Level => assessmentLevels[sport],
    [assessmentLevels]
  )
  const userLevel = userLevelForSport("badminton")

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

  /**
   * Release every expired court hold and drop every stale join
   * request/invite. `conflictFor`/`courtHolds` already ignore an expired hold
   * on read, so this sweep only exists to clean up the visible roster/court
   * fields and fire the toast + {@link expiredEvents} notification — it's not
   * load-bearing for blocking correctness.
   */
  const sweepExpirations = React.useCallback(() => {
    const now = Date.now()
    const releasedHolds: PlaySession[] = []
    const droppedRsvps: { initials: string; kind: "request" | "invite" }[] = []
    setSessions((prev) =>
      prev.map((s) => {
        let next = s
        if (
          next.status === "forming" &&
          next.holdExpiresAt != null &&
          next.holdExpiresAt <= now
        ) {
          next = {
            ...next,
            courtId: null,
            courtLabel: null,
            slot: null,
            holdExpiresAt: undefined,
          }
          releasedHolds.push(next)
        }
        const stale = next.roster.filter(
          (p) =>
            (p.rsvp === "requested" || p.rsvp === "pending") &&
            p.rsvpAt != null &&
            now - p.rsvpAt >
              (p.rsvp === "requested" ? REQUEST_EXPIRY_MS : INVITE_EXPIRY_MS)
        )
        if (stale.length) {
          stale.forEach((p) =>
            droppedRsvps.push({
              initials: p.initials,
              kind: p.rsvp === "requested" ? "request" : "invite",
            })
          )
          next = {
            ...next,
            roster: next.roster.filter(
              (p) => !stale.some((d) => d.initials === p.initials)
            ),
          }
        }
        return next
      })
    )
    releasedHolds.forEach((s) => {
      persist(s)
      toast(tb("toast.holdExpired"), { description: s.venue })
      setExpiredEvents((prev) => [
        ...prev,
        { id: `hx-${s.id}-${now}`, kind: "hold", title: s.title },
      ])
    })
    droppedRsvps.forEach(({ initials, kind }) => {
      const name = playerByInitials(initials).name
      toast(
        kind === "request"
          ? ts("toast.requestExpired")
          : ts("toast.inviteExpired"),
        { description: name }
      )
      setExpiredEvents((prev) => [
        ...prev,
        { id: `rx-${initials}-${now}-${prev.length}`, kind, title: name },
      ])
    })
  }, [tb, ts, playerByInitials])

  // Passive sweep: independent of the search `clock` above (which only runs
  // during an active Quick Match) — this runs for the provider's whole
  // lifetime so an abandoned hold or unanswered request/invite still expires
  // even when no other timer is active.
  React.useEffect(() => {
    const first = setTimeout(sweepExpirations, 0)
    const id = setInterval(sweepExpirations, 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [sweepExpirations])

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
  // Sessions the user is already committed to at a real time — hosting, going,
  // or a still-pending request all reserve (or aim to reserve) a seat in a
  // specific slot. A player can only physically attend one game at a time, so
  // these back the overlap guard below: joining a second room whose slot clashes
  // with one of these would let one player hoard seats across rooms — a seat they
  // could never use, denied to real players. Cancelled/completed rooms and slots
  // that aren't set yet (no time to clash with) are excluded.
  const committedSessions = React.useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.status !== "cancelled" &&
          s.status !== "completed" &&
          s.slot != null &&
          s.roster.some(
            (p) => p.initials === USER.initials && p.rsvp !== "declined"
          )
      ),
    [sessions, USER.initials]
  )
  // The already-committed session whose time overlaps `room` (same day + range),
  // or null when joining `room` wouldn't double-book the player. The target room
  // itself is skipped so re-opening a room you're already in never "conflicts."
  const overlappingCommitment = React.useCallback(
    (room: MatchRoom): PlaySession | null => {
      const target = sessions.find((s) => s.id === room.id)
      if (!target || target.slot == null) return null
      return (
        committedSessions.find(
          (s) =>
            s.id !== target.id &&
            s.dayKey === target.dayKey &&
            rangesOverlap(
              target.slot!,
              target.durationMin,
              s.slot!,
              s.durationMin
            )
        ) ?? null
      )
    },
    [sessions, committedSessions]
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
    const dayKey = room.dayKey
    if (f.day === "today" && dayKey !== todayIso) return false
    if (
      f.day === "today-tomorrow" &&
      dayKey !== todayIso &&
      dayKey !== addDaysIso(todayIso, 1)
    )
      return false
    if (f.format !== "any" && room.format !== f.format) return false
    if (f.level === "any") return true
    const target = f.level === "my" ? userLevelForSport(room.sport) : f.level
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
                    ? { ...p, rsvp: "going" }
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
                  rsvp: "requested",
                  rsvpAt: Date.now(),
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
    // Don't let one player hold seats in overlapping rooms. If this room's slot
    // clashes with a game they're already committed to, block the join and point
    // them at the conflicting room rather than reserving a seat they can't use.
    const clash = overlappingCommitment(room)
    if (clash) {
      toast.error(ts("toast.overlapTitle"), {
        description: ts("toast.overlapBody", { title: clash.title }),
      })
      return
    }
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
            p.initials === initials ? { ...p, rsvp: "going" } : p
          ),
        }
      })
    )
    addRealRoomMember(sessionId, initials)
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
    removeRealRoomMember(sessionId, initials)
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
      userLevelForSport(session.sport),
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
                      rsvp: "requested",
                      rsvpAt: Date.now(),
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
    // A member leaving removes themselves from the chat; the host cancelling a
    // booked room freezes it instead (keeps history, blocks new sends).
    if (!hosting) removeRealRoomMember(sessionId, authUser.id)
    else if (s.status === "booked") freezeRoomChatBestEffort(sessionId)
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
      dayKey: room.dayKey ?? todayIso,
      dayLabel: room.day,
      slot: room.time ? room.time.split(" – ")[0] : null,
      durationMin: room.durationMin ?? durationOf(room.time),
      courtLabel: null,
      host: room.host,
      capacity: room.capacity,
      roster: room.players.map((init) => ({
        name: playerByInitials(init).name,
        initials: init,
        rsvp: (init === room.host.initials ? "host" : "going"),
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
    persist(next)
    openRoomChat(next.id, next.title)
    scheduleJoinRequests(next)
  }

  const createInviteRoom = ({
    title,
    sport,
    format,
    courtId,
    venue,
    district,
    distanceKm,
    dayKey,
    dayLabel,
    slot,
    durationMin,
    level,
    pricePerHour,
    invitees,
  }: {
    title: string
    sport: SportKey
    format: "Singles" | "Doubles"
    courtId?: string | null
    venue: string
    district: string
    distanceKm: number
    dayKey: string
    dayLabel: string
    slot: string
    durationMin: number
    level: RoomLevel
    pricePerHour: number
    invitees: string[]
  }) => {
    const id = newId("grp")
    const next: PlaySession = {
      id,
      title,
      sport,
      format,
      courtId: courtId ?? null,
      dayKey,
      dayLabel,
      slot,
      durationMin,
      courtLabel: null,
      host: { name: userName, initials: USER.initials },
      capacity: Math.max(invitees.length + 1, format === "Singles" ? 2 : 4),
      roster: [
        {
          name: userName,
          initials: USER.initials,
          rsvp: "host",
        },
      ],
      level,
      status: "forming",
      listed: false,
      fillIntent: "invite",
      venue,
      district,
      distanceKm,
      pricePerHour,
    }

    const full: PlaySession = {
      ...next,
      roster: [
        ...next.roster,
        ...invitees.map(
          (initials): SessionPlayer => ({
            name: playerByInitials(initials).name,
            initials,
            rsvp: "pending",
            rsvpAt: Date.now(),
          })
        ),
      ],
    }
    setSessions((prev) => [full, ...prev])
    setJoinedIds((prev) => new Set(prev).add(id))
    setActiveSessionId(id)
    persist(full)
    openRoomChat(id, title)
    scheduleRsvp(id, invitees)
    return id
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
                            rsvp: (declined ? "declined" : "going"),
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
                  rsvp: "pending",
                  rsvpAt: Date.now(),
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
    removeRealRoomMember(sessionId, initials)
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
        userLevelForSport(session.sport),
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
                  ...partners.map(
                    (p): SessionPlayer => ({
                      name: p.name,
                      initials: p.initials,
                      rsvp: "pending",
                      rsvpAt: Date.now(),
                    })
                  ),
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
      dayKey: todayIso,
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
      level: userLevelForSport(opts.sport),
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
    openRoomChat(id, next.title)
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
      const partner = pickPartners(sport, userLevelForSport(sport), 1, [])[0]
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
      (r) =>
        isSuitable(r) &&
        !overlappingCommitment(r) &&
        matchesQuickFilters(r, filters)
    )
    if (pool.length) {
      const best = [...pool].sort((a, b) => {
        const exact = (r: MatchRoom) =>
          r.level === userLevelForSport(r.sport) ? 0 : 1
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
    setPaymentResult(null)
    setPayAttempts(0)
    setDraft({
      dayKey: linked ? linked.dayKey : todayIso,
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

  // Atomically grow capacity + add players in one setState so the stale-closure
  // guard in invitePlayer (which reads the pre-update sessions) is bypassed.
  // Returns the count actually added (may be < initials.length when at cap 8).
  const addPlayersToSession = (sessionId: string, initials: string[]): number => {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return 0
    const fresh = initials.filter(
      (init) => !s.roster.some((p) => p.initials === init)
    )
    if (!fresh.length) return 0
    const currentActive = activeRoster(s).length
    const canFit = Math.max(0, MAX_CAPACITY - currentActive)
    const toAdd = fresh.slice(0, canFit)
    if (!toAdd.length) return 0
    const newCapacity = Math.max(s.capacity, currentActive + toAdd.length)
    setSessions((prev) =>
      prev.map((x) =>
        x.id !== sessionId
          ? x
          : {
              ...x,
              capacity: newCapacity,
              roster: [
                ...x.roster,
                ...toAdd.map(
                  (init): SessionPlayer => ({
                    name: playerByInitials(init).name,
                    initials: init,
                    rsvp: "pending",
                    rsvpAt: Date.now(),
                  })
                ),
              ],
            }
      )
    )
    scheduleRsvp(sessionId, toAdd)
    return toAdd.length
  }

  const closeBooking = () => {
    // Abandon any in-flight faked payment so a stale timer can't fire.
    const handle = timers.current.get("pay:new:run")
    if (handle) {
      clearTimeout(handle)
      timers.current.delete("pay:new:run")
    }
    setPaying(false)
    setPaymentResult(null)
    setOpen(false)
    // Return to wherever the wizard was opened from.
    router.back()
  }
  const next = () => {
    // Leaving the slot step locks in a real, timed court hold — before that,
    // nothing but local draft state is at stake.
    if (steps[step] === "slot") startCourtHold()
    setStep((s) => Math.min(steps.length - 1, s + 1))
  }
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

  /**
   * Reserve `court` for the draft's day/slot the moment it's picked — before
   * payment. Times out after HOLD_MS ({@link courtHolds}/{@link conflictFor}
   * treat it as an active hold until then) so an abandoned or slow checkout
   * doesn't lock the slot forever. Creates a fresh solo `forming` hold if this
   * booking isn't tied to an existing room, else stamps the linked room's
   * hold — either way `linkedId` ends up pointing at the held session, so
   * {@link confirmBooking} finalizes that same record on payment success.
   */
  const startCourtHold = () => {
    if (!court || !draft.slot || draftConflict) return
    const dayLabel = locStr(dayLabelFor(draft.dayKey), locale)
    const courtLabel = courtNumberFor(court.id)
    const holdExpiresAt = Date.now() + HOLD_MS
    const existing = linkedId ? sessions.find((s) => s.id === linkedId) : null
    if (existing) {
      const held: PlaySession = {
        ...existing,
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
        holdExpiresAt,
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === existing.id ? held : s))
      )
      persist(held)
      return
    }
    const sport = court.sports[0]
    const id = newId("hold")
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
      level: userLevelForSport(sport),
      status: "forming",
      listed: false,
      fillIntent: "court",
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      pricePerHour: court.pricePerHour,
      holdExpiresAt,
    }
    setSessions((prev) => [next, ...prev])
    persist(next)
    openRoomChat(id, next.title)
    setLinkedId(id)
  }

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
    const dayLabel = locStr(dayLabelFor(draft.dayKey), locale)
    const time = slotRange(draft.slot, draft.durationMin)
    const linked = linkedId ? sessions.find((s) => s.id === linkedId) : null
    const sport = linked?.sport ?? court.sports[0]
    const courtLabel = courtNumberFor(court.id)

    if (linked) {
      // Transition an existing forming room into a booked one. It arrives
      // `pending` — the venue operator approves it (or declines with a reason),
      // which flows back to this session via the seed reconcile.
      const booked: PlaySession = {
        ...linked,
        status: "booked",
        hold: "pending",
        holdExpiresAt: undefined,
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
      setSessions((prev) =>
        prev.map((s) => (s.id === linked.id ? booked : s))
      )
      persist(booked)
      toast.success(tb("toast.pending"), {
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
      level: userLevelForSport(sport),
      status: "booked",
      hold: "pending",
      listed: false,
      fillIntent: "court",
      venue: court.name,
      district: court.district,
      distanceKm: court.distanceKm,
      pricePerHour: court.pricePerHour,
    }
    setSessions((prev) => [next, ...prev])
    persist(next)
    openRoomChat(id, next.title)
    toast.success(tb("toast.pending"), {
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
    const amount = Math.round(priceFor(court.pricePerHour, draft.durationMin) * 0.05)
    // Never charge for a slot that was taken in the meantime.
    if (draftConflict) {
      setPaymentResult({
        status: "failed",
        amount,
        reason: "conflict",
      })
      return
    }
    setPaying(true)
    const key = "pay:new:run"
    const currentAttempt = payAttempts
    setPayAttempts((prev) => prev + 1)
    const handle = setTimeout(() => {
      timers.current.delete(key)
      setPaying(false)
      const shouldFail =
        currentAttempt === 0 &&
        hash(
          `${court.id}:${draft.dayKey}:${draft.slot}:${draft.durationMin}:${linkedId ?? "new"}`
        ) %
          5 ===
        0
      setPaymentResult(
        shouldFail
          ? {
              status: "failed",
              amount,
              reason: "declined",
            }
          : {
              status: "success",
              amount,
            }
      )
    }, PAY_MS)
    timers.current.set(key, handle)
  }

  const dismissPaymentResult = () => {
    setPaymentResult(null)
  }

  const acknowledgePaymentSuccess = () => {
    if (paymentResult?.status !== "success") return
    setPaymentResult(null)
    confirmBooking()
  }

  const cancelBooking = (id: string) => {
    const s = sessions.find((x) => x.id === id)
    if (!s) return
    if (s.listed) {
      // Keep the team's room open, drop the court hold (revert to forming).
      const reverted: PlaySession = {
        ...s,
        status: "forming",
        hold: undefined,
        courtLabel: null,
        slot: null,
      }
      setSessions((prev) => prev.map((x) => (x.id === id ? reverted : x)))
      persist(reverted)
    } else {
      clearTimersFor(id)
      const cancelled: PlaySession = { ...s, status: "cancelled" }
      setSessions((prev) => prev.map((x) => (x.id === id ? cancelled : x)))
      dropJoined(id)
      persist(cancelled)
      freezeRoomChatBestEffort(id)
    }
    toast(tb("toast.cancelled"), { description: s.venue })
  }

  const value: SessionContextValue = {
    sessions,
    joinedIds,
    userLevel,
    setUserLevel: setFallbackUserLevel,
    userLevels: assessmentLevels,
    userLevelForSport,
    userName,
    setUserName,
    search,
    expiredEvents,
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
    hasTimeConflict: (room) => overlappingCommitment(room) !== null,
    joinRoom,
    approveRequest,
    declineRequest,
    leaveRoom,
    addRoom,
    createInviteRoom,
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
    addPlayersToSession,
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
    paymentResult,
    pay,
    acknowledgePaymentSuccess,
    dismissPaymentResult,
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
