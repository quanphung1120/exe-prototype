"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  isToolUIPart,
  getToolName,
  isTextUIPart,
  isReasoningUIPart,
} from "ai"
import type { UIMessage } from "ai"
import {
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  Loader2,
  MapPin,
  Plus,
  Shield,
  Sparkles,
  Star,
  Users,
  UserPlus,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"

import {
  roomChatId,
  useChat as useChatStore,
} from "@/components/dashboard/chat-store"
import { useBooking } from "@/components/dashboard/booking"
import {
  activeRoster,
  formatVnd,
  type Court,
  type Level,
  type MatchRoom,
  type PlaySession,
  type SportKey,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useSession } from "@/components/dashboard/session"
import {
  CourtImage,
  LevelChip,
  MatchMeter,
  SportTag,
} from "@/components/dashboard/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { LogoMark } from "@/components/logo"
import { PlayerProfileDialog } from "@/components/dashboard/profile-dialog"
import { type LatLng } from "@/components/dashboard/court-map"
import { Flip, gsap, prefersReducedMotion } from "@/lib/gsap"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"
import { useRouter } from "@/i18n/navigation"
import {
  chooseSuggestedCourt,
  summarizeInviteDay,
  type PlayerMatchIntent,
  type PlayerMatchResult,
} from "@/lib/player-matching"
import {
  readStoredAssessment,
  PLAYER_ASSESSMENT_PATH,
} from "@/lib/player-assessment"

// ─── Types mirroring tool execute return values ───────────────────────────────

interface CourtToolResult {
  courts: Court[]
  sortBy: string
  sport: SportKey | null
  sports?: SportKey[] | null
  filteredByTime?: string | null
  districtMatched?: boolean | null
}

interface PlayerToolResult {
  intent: PlayerMatchIntent
  players: PlayerMatchResult[]
}

interface ClarifyToolResult {
  question: string
  options: string[]
}

interface AssessmentToolResult {
  sport: SportKey
}

interface RoomToolResult {
  rooms: MatchRoom[]
  sport: SportKey | null
  sports?: SportKey[] | null
  level: Level | null
  districtMatched?: boolean | null
}

interface BookingToolResult {
  success: boolean
  bookingId?: string
  courtId?: string
  court?: string
  district?: string
  sport?: SportKey
  date?: string
  time?: string
  durationMin?: number
  pricePerHour?: number
  totalPrice?: number
  reason?: string
  suggestTime?: string
}

// Discriminate the tool output by payload shape rather than tool name.
// Server tool types aren't imported on the client, so we rely on the
// output payload's structure instead of the typed discriminant.
type ToolResult =
  | { kind: "courts"; value: CourtToolResult }
  | { kind: "players"; value: PlayerToolResult }
  | { kind: "rooms"; value: RoomToolResult }
  | { kind: "clarify"; value: ClarifyToolResult }
  | { kind: "assessment"; value: AssessmentToolResult }
  | { kind: "booking"; value: BookingToolResult }

function toolResult(output: unknown): ToolResult | null {
  if (!output || typeof output !== "object") return null
  const o = output as Record<string, unknown>
  if (Array.isArray(o.courts))
    return { kind: "courts", value: output as CourtToolResult }
  if (Array.isArray(o.players))
    return { kind: "players", value: output as PlayerToolResult }
  if (Array.isArray(o.rooms))
    return { kind: "rooms", value: output as RoomToolResult }
  if (typeof o.question === "string" && Array.isArray(o.options))
    return { kind: "clarify", value: output as ClarifyToolResult }
  if (typeof o.success === "boolean" && ("bookingId" in o || "reason" in o))
    return { kind: "booking", value: output as BookingToolResult }
  if (
    typeof o.sport === "string" &&
    (o.sport === "badminton" || o.sport === "pickleball") &&
    !("courts" in o) &&
    !("players" in o) &&
    !("rooms" in o)
  )
    return { kind: "assessment", value: output as AssessmentToolResult }
  return null
}

function trustTone(trust: number) {
  if (trust >= 90) return "bg-brand/10 text-brand"
  if (trust >= 80) return "bg-secondary text-secondary-foreground"
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

function buildInviteTitle(intent: PlayerMatchIntent, sport: SportKey) {
  const label = sport === "badminton" ? "Badminton" : "Pickleball"
  if (intent.timeLabel) return `${label} ${intent.timeLabel} group`
  if (intent.locationLabel) return `${label} ${intent.locationLabel} group`
  return `${label} teammate group`
}

// Flip must read/write the DOM before paint to avoid a one-frame flash at the
// destination; fall back to useEffect on the server where layout effects no-op.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

// ─── Main view ───────────────────────────────────────────────────────────────

export function AiNativeDashboardView() {
  const t = useTranslations("AiDashboard")
  const locale = useLocale()
  const { courts, user: USER } = useData()
  const { openBooking } = useBooking()
  const { createInviteRoom, addPlayersToSession, sessions, joinedIds, joinRoom, userLevelForSport, userLevels } = useSession()
  const { setActiveChatId } = useChatStore()
  const router = useRouter()

  const [input, setInput] = React.useState("")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [profile, setProfile] = React.useState<string | null>(null)
  const [inviteState, setInviteState] = React.useState<{
    status: "idle" | "sending" | "sent"
    roomId: string | null
  }>({ status: "idle", roomId: null })
  const inviteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Composer geometry captured in the welcome state, replayed once the first
  // message swaps in the thread layout so the composer glides down rather than
  // snapping to the bottom. See the Flip effect below.
  const composerFlip = React.useRef<ReturnType<typeof Flip.getState> | null>(
    null
  )

  // The user's real position, attached to every request so the model can rank
  // courts by actual distance (the seed `distanceKm` is static). Stays null if
  // the browser denies/lacks geolocation — the server then falls back to seed.
  const [userLoc, setUserLoc] = React.useState<LatLng | null>(null)

  // Ask for a fix once on mount. Deferred a tick so the synchronous "no
  // geolocation" path never calls setState inside the effect body
  // (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    const id = setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }, 0)
    return () => clearTimeout(id)
  }, [])

  // Best-effort geolocation for a single request: return the cached fix if we
  // have one, otherwise make a short on-demand attempt so an early "near me"
  // query still gets real coordinates instead of silently falling back to the
  // static seed distances. Resolves null (never rejects) when denied/unavailable.
  const resolveLocation = React.useCallback(
    () =>
      new Promise<LatLng | null>((resolve) => {
        if (userLoc) return resolve(userLoc)
        if (typeof navigator === "undefined" || !navigator.geolocation)
          return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            setUserLoc(loc)
            resolve(loc)
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000 }
        )
      }),
    [userLoc]
  )

  // AI SDK v6 — sendMessage replaces handleSubmit/append
  const { messages, sendMessage, status, setMessages } = useChat()
  const isLoading = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    const handleClear = () => {
      setMessages([])
      setInput("")
      setSelectedIds([])
      setInviteState({ status: "idle", roomId: null })
      if (inviteTimerRef.current) {
        clearTimeout(inviteTimerRef.current)
      }
    }
    window.addEventListener("clear-ai-chat", handleClear)
    return () => {
      window.removeEventListener("clear-ai-chat", handleClear)
    }
  }, [setMessages])

  // Stick to the bottom as new content streams — but only when the user is
  // already near the bottom, so scrolling up to read earlier results isn't
  // yanked back on every token. Instant ("auto") scroll avoids the jank of a
  // smooth animation restarting on each streamed chunk.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTo({ top: el.scrollHeight })
  }, [messages, isLoading])

  React.useEffect(() => {
    return () => {
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current)
    }
  }, [])

  const showWelcome = messages.length === 0

  // Collect court IDs that were successfully booked via the AI chat in this
  // session, so tapping "Book" on an earlier findCourts card doesn't open the
  // wizard and create a duplicate booking for the same court.
  const aiBookedCourtIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts ?? []) {
        if (isToolUIPart(part) && part.state === "output-available") {
          const result = toolResult((part as { output: unknown }).output)
          if (result?.kind === "booking" && result.value.success && result.value.courtId) {
            ids.add(result.value.courtId)
          }
        }
      }
    }
    return ids
  }, [messages])

  // Play the welcome → thread transition: the composer (tagged with a shared
  // data-flip-id in both layouts) glides from screen-centre down to its pinned
  // position, while the first message fades up beside it. The "from" geometry is
  // captured in submit() while the welcome layout is still mounted.
  useIsomorphicLayoutEffect(() => {
    if (showWelcome) return
    const state = composerFlip.current
    if (!state) return
    composerFlip.current = null

    const flip = Flip.from(state, {
      duration: 0.55,
      ease: "power3.inOut",
    })

    const intro = scrollRef.current
      ? gsap.from(scrollRef.current.children, {
          opacity: 0,
          y: 12,
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.06,
          delay: 0.1,
        })
      : null

    return () => {
      flip?.kill()
      intro?.kill()
    }
  }, [showWelcome])

  // Find the last player result anywhere in the conversation. Detect by output
  // shape (see toolResult) so it works even when the tool name is missing.
  const lastPlayerResult = React.useMemo<PlayerToolResult | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== "assistant") continue
      for (const part of msg.parts ?? []) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue
        const result = toolResult((part as { output: unknown }).output)
        if (result?.kind === "players") return result.value
      }
    }
    return null
  }, [messages])

  // Rooms the user hosts that are active and have space to accept more players.
  // Only hosted rooms are shown — inviting players to someone else's room doesn't
  // make sense without host approval (which is a separate join-request flow).
  const eligibleRooms = React.useMemo<PlaySession[]>(
    () =>
      sessions.filter(
        (s) =>
          joinedIds.has(s.id) &&
          s.host.initials === USER.initials &&
          s.status !== "cancelled" &&
          activeRoster(s).length < 8
      ),
    [sessions, joinedIds, USER.initials]
  )

  const selectedPlayers = React.useMemo(
    () =>
      lastPlayerResult
        ? lastPlayerResult.players.filter((p) => selectedIds.includes(p.id))
        : [],
    [lastPlayerResult, selectedIds]
  )

  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    // Capture the centered composer's geometry while it's still on screen, so
    // the Flip effect can animate it down once this message swaps in the thread.
    if (messages.length === 0 && !prefersReducedMotion()) {
      composerFlip.current = Flip.getState('[data-flip-id="ai-composer"]')
    }
    // A new query starts a fresh result context — clear selections, the open
    // profile, and any invite state (incl. a pending invite timer) carried over
    // from the previous search, so the invite bar can't show a stale "sent"
    // state wired to the old room while displaying new players.
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current)
      inviteTimerRef.current = null
    }
    setSelectedIds([])
    setProfile(null)
    setInviteState({ status: "idle", roomId: null })
    setInput("")
    // Resolve location before sending so the first "near me" query ranks by real
    // distance. Attach the per-sport skill levels and location as extra request
    // body fields — the route reads them to personalise ranking + matching.
    const userLocation = await resolveLocation()
    const assessment = readStoredAssessment()
    const activeUserLevels: Record<string, string> = {}
    if (assessment?.results?.badminton) {
      activeUserLevels.badminton = userLevels.badminton
    }
    if (assessment?.results?.pickleball) {
      activeUserLevels.pickleball = userLevels.pickleball
    }
    sendMessage({ text: trimmed }, { body: { userLevels: activeUserLevels, userLocation, locale } })
  }

  const togglePlayer = (player: PlayerMatchResult) => {
    setSelectedIds((prev) =>
      prev.includes(player.id)
        ? prev.filter((id) => id !== player.id)
        : [...prev, player.id]
    )
  }

  const openGroupChat = () => {
    if (!inviteState.roomId) return
    setActiveChatId(roomChatId(inviteState.roomId))
    router.push("/dashboard/chat")
  }

  const inviteToChat = () => {
    if (!lastPlayerResult || !selectedPlayers.length) {
      toast.error(t("selectPlayerError"))
      return
    }
    const inviteSport: SportKey =
      lastPlayerResult.intent.sport ?? selectedPlayers[0]?.sport ?? "badminton"
    const suggestedCourt = chooseSuggestedCourt(
      courts,
      inviteSport,
      lastPlayerResult.intent.locationLabel
    )
    const schedule = summarizeInviteDay(lastPlayerResult.intent.timeKey)

    setInviteState({ status: "sending", roomId: null })
    inviteTimerRef.current = setTimeout(() => {
      try {
        const roomId = createInviteRoom({
          title: buildInviteTitle(lastPlayerResult.intent, inviteSport),
          sport: inviteSport,
          format: selectedPlayers.length + 1 >= 4 ? "Doubles" : "Singles",
          courtId: suggestedCourt?.id ?? null,
          venue: suggestedCourt?.name ?? "SportMatch Group",
          district:
            lastPlayerResult.intent.locationLabel ??
            suggestedCourt?.district ??
            "Near you",
          distanceKm:
            suggestedCourt?.distanceKm ?? selectedPlayers[0]?.distanceKm ?? 1,
          dayKey: schedule.dayKey,
          dayLabel: schedule.dayLabel,
          slot: schedule.slot,
          durationMin: 90,
          level:
            (lastPlayerResult.intent.targetLevel as Level | null) ??
            userLevelForSport(inviteSport),
          pricePerHour: suggestedCourt?.pricePerHour ?? 0,
          invitees: selectedPlayers.map((p) => p.initials),
        })
        if (!roomId) throw new Error("Unable to create group chat")
        setInviteState({ status: "sent", roomId })
        toast.success(t("inviteSent"), {
          description: t("groupChatCreated"),
        })
      } catch {
        setInviteState({ status: "idle", roomId: null })
        toast.error(t("inviteFailed"))
      } finally {
        inviteTimerRef.current = null
      }
    }, 700)
  }

  const addToRoom = (session: PlaySession) => {
    if (!selectedPlayers.length) {
      toast.error(t("selectPlayerError"))
      return
    }
    const added = addPlayersToSession(
      session.id,
      selectedPlayers.map((p) => p.initials)
    )
    if (added === 0) {
      toast.error(t("inviteFailed"))
      return
    }
    setInviteState({ status: "sent", roomId: session.id })
    toast.success(t("addedToRoom"), {
      description: t("addedToRoomDesc"),
    })
  }

  // Shared composer — identical input in both the empty and active states.
  const composer = (
    <div
      data-flip-id="ai-composer"
      className="rounded-[2rem] border border-border bg-background p-2 shadow-xl shadow-foreground/5"
    >
      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit(input)
            }
          }}
          placeholder={isLoading ? t("thinking") : t("inputPlaceholder")}
          aria-label="Ask SportMatch AI"
          disabled={isLoading}
          className="max-h-32 min-h-12 flex-1 border-0 bg-transparent py-3.5 pr-0 pl-3 sm:pl-4 text-base sm:text-lg shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          size="icon"
          className="mb-1 rounded-full bg-foreground text-background hover:bg-foreground/90"
          aria-label="Send"
          onClick={() => submit(input)}
          disabled={isLoading || !input.trim()}
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  )

  const promptItems = [
    { key: "badmintonNearMe" },
    { key: "bookTomorrow" },
    { key: "sameLevelPlayers" },
    { key: "badmintonTeammates" },
    { key: "quickMatch" },
  ]

  const quickPrompts = (
    <div className="flex flex-wrap justify-center gap-3 w-full px-2">
      {promptItems.map(({ key }) => {
        const text = t(`prompts.${key}`)
        const desc = t(`prompts.${key}Desc`)
        return (
          <button
            key={key}
            type="button"
            onClick={() => submit(text)}
            className={cn(
              "group relative flex w-full sm:w-56 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/80 bg-background/50 p-4 text-center shadow-sm backdrop-blur-sm transition-all duration-300",
              "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/30 hover:shadow-md"
            )}
          >
            <div className="space-y-1">
              <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                {text}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {desc}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )

  const profileDialog = (
    <PlayerProfileDialog
      initials={profile}
      open={Boolean(profile)}
      onOpenChange={(open) => {
        if (!open) setProfile(null)
      }}
    />
  )

  // Empty state — centered hero + composer, ChatGPT-style. Collapses into the
  // thread layout below as soon as the first message lands.
  if (showWelcome) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-9.5rem)] w-full max-w-3xl flex-col items-center justify-center gap-8 px-2 py-4">
        <section className="flex flex-col items-center gap-4 text-center">
          <LogoMark className="size-14 text-primary" />
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("welcomeTitle")}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">
              {t("welcomeSubtitle")}
            </p>
          </div>
        </section>

        <div className="w-full">{composer}</div>

        {quickPrompts}

        {profileDialog}
      </div>
    )
  }

  // Active conversation — thread scrolls, composer pinned at the bottom.
  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-3xl flex-col">
      {/* Thread */}
      <div
        ref={scrollRef}
        className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
      >
        {messages.map((msg, index) => (
          <ChatMessageRow
            key={msg.id}
            message={msg}
            selectedIds={selectedIds}
            // Only the latest turn's clarify chips stay tappable, and never
            // while a response is streaming.
            interactive={!isLoading && index === messages.length - 1}
            isStreaming={isLoading && index === messages.length - 1}
            onChoose={submit}
            onTogglePlayer={togglePlayer}
            onOpenProfile={(p) => setProfile(p.initials)}
            onBook={(courtId) => {
              if (aiBookedCourtIds.has(courtId)) {
                toast.info("Already booked via chat — check My Bookings.")
                return
              }
              openBooking(courtId)
            }}
            onJoinRoom={joinRoom}
          />
        ))}

        {/* Pulse while waiting for first token */}
        {isLoading && messages[messages.length - 1]?.role === "user" ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-brand" />
              {t("thinking")}
            </div>
          </div>
        ) : null}
      </div>

      {/* Player invite action bar */}
      {lastPlayerResult ? (
        <div className="shrink-0 border-t border-border/60 bg-background px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {selectedPlayers.length ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {t("selectedCount", { count: selectedPlayers.length })}
                </span>
                {selectedPlayers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                  >
                    {p.name}
                    <X className="size-3 text-muted-foreground" />
                  </button>
                ))}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("selectPlayersInvite")}
              </span>
            )}
            <div className="ml-auto flex shrink-0 gap-2">
              {inviteState.status === "sent" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={openGroupChat}
                >
                  <Sparkles />
                  {t("openGroupChat")}
                </Button>
              ) : (
                <>
                  {eligibleRooms.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={
                              !selectedPlayers.length ||
                              inviteState.status === "sending"
                            }
                          >
                            <UserPlus />
                            {t("addToExistingRoom")}
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-56">
                        {eligibleRooms.map((room) => {
                          const open = room.capacity - activeRoster(room).length
                          return (
                            <DropdownMenuItem
                              key={room.id}
                              onClick={() => addToRoom(room)}
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium">
                                  {room.title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {room.dayLabel} · {open} open
                                </span>
                              </div>
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={inviteToChat}
                    disabled={
                      !selectedPlayers.length || inviteState.status === "sending"
                    }
                  >
                    <Users />
                    {inviteState.status === "sending"
                      ? t("sending")
                      : t("inviteToGroupChat")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <div className="shrink-0 pt-1 pb-2">{composer}</div>

      {profileDialog}
    </div>
  )
}

// ─── Message row ──────────────────────────────────────────────────────────────

function ChatMessageRow({
  message,
  selectedIds,
  interactive,
  isStreaming,
  onChoose,
  onTogglePlayer,
  onOpenProfile,
  onBook,
  onJoinRoom,
}: {
  message: UIMessage
  selectedIds: string[]
  interactive: boolean
  isStreaming: boolean
  onChoose: (text: string) => void
  onTogglePlayer: (p: PlayerMatchResult) => void
  onOpenProfile: (p: PlayerMatchResult) => void
  onBook: (courtId: string) => void
  onJoinRoom: (room: MatchRoom) => void
}) {
  if (message.role === "user") {
    const text = (message.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-primary px-5 py-3 text-sm sm:text-base text-primary-foreground">
          {text}
        </div>
      </div>
    )
  }

  if (message.role !== "assistant") return null

  const parts = message.parts ?? []

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, i) => {
        if (isReasoningUIPart(part)) {
          if (!part.text.trim()) return null
          return (
            <ThinkingBlock
              key={i}
              text={part.text}
              done={part.state !== "streaming"}
            />
          )
        }

        if (isTextUIPart(part)) {
          if (!part.text) return null
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base">
                <Streamdown animated isAnimating={isStreaming}>
                  {part.text}
                </Streamdown>
              </div>
            </div>
          )
        }

        if (isToolUIPart(part)) {
          const isDone = part.state === "output-available"
          const result = isDone
            ? toolResult((part as { output: unknown }).output)
            : null

          if (isDone && result?.kind === "courts") {
            return (
              <CourtChatResult
                key={i}
                courts={result.value.courts}
                sortBy={result.value.sortBy}
                onBook={onBook}
              />
            )
          }

          if (isDone && result?.kind === "players") {
            return (
              <PlayerChatResult
                key={i}
                players={result.value.players}
                selectedIds={selectedIds}
                onToggle={onTogglePlayer}
                onOpenProfile={onOpenProfile}
              />
            )
          }

          if (isDone && result?.kind === "rooms") {
            return (
              <RoomChatResult
                key={i}
                rooms={result.value.rooms}
                onJoin={onJoinRoom}
              />
            )
          }

          if (isDone && result?.kind === "clarify") {
            return (
              <ClarifyChatResult
                key={i}
                question={result.value.question}
                options={result.value.options}
                disabled={!interactive}
                onChoose={onChoose}
              />
            )
          }

          if (isDone && result?.kind === "assessment") {
            return (
              <RequestAssessmentChatResult
                key={i}
                sport={result.value.sport}
              />
            )
          }

          if (isDone && result?.kind === "booking") {
            return (
              <BookingChatResult
                key={i}
                booking={result.value}
                disabled={!interactive}
                onChoose={onChoose}
              />
            )
          }

          if (!isDone) {
            return <SearchingIndicator key={i} toolName={getToolName(part)} />
          }

          return null
        }

        return null
      })}
    </div>
  )
}

// ─── Thinking block (real streamed model reasoning) ───────────────────────────

function ThinkingBlock({ text, done }: { text: string; done: boolean }) {
  const t = useTranslations("AiDashboard")
  // Open while the model is thinking; auto-collapse shortly after it finishes.
  const [collapsed, setCollapsed] = React.useState(false)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!done) return
    const timerId = setTimeout(() => setCollapsed(true), 1200)
    return () => clearTimeout(timerId)
  }, [done])

  // Keep the latest reasoning in view as it streams.
  React.useEffect(() => {
    if (!done && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [text, done])

  return (
    <div className="rounded-3xl bg-muted/40 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <button
        type="button"
        onClick={() => done && setCollapsed((c) => !c)}
        disabled={!done}
        className="flex w-full items-center gap-2 text-left"
      >
        {done ? (
          <Sparkles className="size-3.5 text-brand" />
        ) : (
          <Loader2 className="size-3.5 animate-spin text-brand" />
        )}
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {done ? t("reasoning") : t("thinking")}
        </span>
        {done ? (
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
          />
        ) : null}
      </button>
      {!collapsed ? (
        <div
          ref={bodyRef}
          className={cn(
            "mt-2.5 no-scrollbar max-h-44 overflow-y-auto pr-1 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground",
            !done &&
              "mask-[linear-gradient(to_bottom,transparent,black_1.5rem)]"
          )}
        >
          {text}
          {!done ? (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-full bg-brand/70" />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ─── Searching indicator (tool call in flight) ────────────────────────────────

function SearchingIndicator({ toolName }: { toolName: string }) {
  const t = useTranslations("AiDashboard")
  const label =
    toolName === "findCourts"
      ? t("searchingCourts")
      : toolName === "findPlayers"
        ? t("matchingPlayers")
        : toolName === "findRooms"
          ? t("findingRooms")
          : toolName === "bookCourt"
            ? t("bookingCourt")
            : t("working")
  return (
    <div className="flex items-center gap-2 self-start rounded-full bg-muted/60 px-3.5 py-2 text-xs sm:text-sm text-muted-foreground ring-1 ring-foreground/5">
      <Loader2 className="size-3.5 animate-spin text-brand" />
      {label}
    </div>
  )
}

// ─── Clarify (human-in-the-loop) ──────────────────────────────────────────────
// The model asks one question with suggested options; the user taps a chip to
// answer, which is sent straight back as the next message via `onChoose`.

function ClarifyChatResult({
  question,
  options,
  disabled,
  onChoose,
}: {
  question: string
  options: string[]
  disabled: boolean
  onChoose: (text: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base">
          {question}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm sm:text-base text-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Assessment Required Refusal (Human-in-the-loop) ──────────────────────────

function RequestAssessmentChatResult({ sport }: { sport: SportKey }) {
  const t = useTranslations("AiDashboard")
  const tc = useTranslations("Common")
  const router = useRouter()

  return (
    <div className="flex flex-col gap-3 self-start">
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base">
          {t("requireAssessment", { sport: tc(`sports.${sport}`) })}
        </div>
      </div>
      <div className="pl-1">
        <Button
          onClick={() => router.push(PLAYER_ASSESSMENT_PATH)}
          variant="outline"
          className="rounded-full shadow-sm text-sm sm:text-base py-2 px-4"
        >
          {t("completeAssessment")}
        </Button>
      </div>
    </div>
  )
}

// ─── Booking confirmation ─────────────────────────────────────────────────────

function BookingChatResult({
  booking,
  disabled,
  onChoose,
}: {
  booking: BookingToolResult
  disabled: boolean
  onChoose: (text: string) => void
}) {
  if (!booking.success) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base text-muted-foreground">
            {booking.reason ?? "Booking failed — please try again."}
          </div>
        </div>
        {booking.suggestTime ? (
          <div className="flex flex-wrap gap-2 pl-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChoose(`Book at ${booking.suggestTime} instead`)
              }
              className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm sm:text-base text-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock className="mr-1.5 size-3.5" />
              Try {booking.suggestTime}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const mins = booking.durationMin ?? 60
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  const durationLabel =
    hrs > 0 && rem > 0
      ? `${hrs}h ${rem}m`
      : hrs > 0
        ? `${hrs}h`
        : `${rem}m`

  return (
    <div className="flex flex-col gap-2.5 rounded-3xl bg-brand/5 p-4 sm:p-5 ring-1 ring-brand/20">
      <div className="flex items-center gap-2">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10">
          <CheckCheck className="size-3.5 text-brand" />
        </div>
        <span className="font-heading font-semibold text-sm sm:text-base">
          Booking confirmed
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-sm sm:text-base">
        <p className="font-medium">{booking.court}</p>
        <p className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          {booking.district}
        </p>
        <p className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          {booking.date} · {booking.time} · {durationLabel}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-brand/10 pt-2.5">
        <span className="font-mono text-[10px] sm:text-xs tracking-wider text-muted-foreground uppercase">
          {booking.bookingId}
        </span>
        <span className="font-heading font-bold tabular-nums text-sm sm:text-base">
          {booking.totalPrice != null ? formatVnd(booking.totalPrice) : "—"}
        </span>
      </div>
    </div>
  )
}

// ─── Court results ────────────────────────────────────────────────────────────

function CourtChatResult({
  courts,
  sortBy,
  onBook,
}: {
  courts: Court[]
  sortBy: string
  onBook: (courtId: string) => void
}) {
  const t = useTranslations("AiDashboard")
  const scroller = React.useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(false)

  const sync = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setAtStart(el.scrollLeft <= 2)
    setAtEnd(el.scrollLeft >= max - 2)
  }, [])

  React.useEffect(() => {
    sync()
  }, [sync, courts])

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const rankLabel =
    sortBy === "price"
      ? t("rank.price")
      : sortBy === "distance"
        ? t("rank.distance")
        : sortBy === "team"
          ? t("rank.team")
          : t("rank.best")

  const single = courts.length < 2

  return (
    <div className="flex flex-col gap-1.5">
      <p className="pl-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {t("topCourtsRanked", { count: courts.length, sortBy: rankLabel })}
      </p>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={sync}
          className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {courts.map((court, index) => (
            <CourtCard
              key={court.id}
              court={court}
              rank={index + 1}
              solo={single}
              onBook={onBook}
            />
          ))}
        </div>
        {!atStart ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-muted/50 to-transparent" />
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label="Previous"
              className="absolute top-1/2 left-1 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-card/80 shadow ring-1 ring-foreground/10 backdrop-blur-sm"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          </>
        ) : null}
        {!atEnd ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-muted/50 to-transparent" />
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label="Next"
              className="absolute top-1/2 right-1 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-card/80 shadow ring-1 ring-foreground/10 backdrop-blur-sm"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function CourtCard({
  court,
  rank,
  solo,
  onBook,
}: {
  court: Court
  rank: number
  solo?: boolean
  onBook: (courtId: string) => void
}) {
  const scoreWord =
    court.rating >= 4.7
      ? "exceptional"
      : court.rating >= 4.5
        ? "excellent"
        : "veryGood"
  const tf = useTranslations("CourtFinder")
  const ts = useTranslations("Shared")
  const ta = useTranslations("Assistant")
  const tad = useTranslations("AiDashboard")

  return (
    <div
      className={cn(
        "flex shrink-0 snap-start flex-col gap-3 rounded-3xl bg-muted/50 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10",
        solo ? "w-full" : "w-60"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5">
        <CourtImage court={court} className="absolute inset-0 h-full w-full" />
        <span className="absolute top-2 left-2 rounded-full bg-background/85 px-2 py-0.5 text-xs font-semibold backdrop-blur">
          #{rank}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-medium">{court.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {court.district} · {court.distanceKm} km
        </p>
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          <Star className="size-3 fill-lime text-lime" />
          {court.rating}
          <span className="text-[10px] font-medium text-muted-foreground">
            {tf(`score.${scoreWord}`)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Clock className="size-3 shrink-0" />
          {tad("availableFrom", { time: court.nextSlot })}
          <span className="font-normal text-muted-foreground">
            · {tad("slotsOpen", { count: court.openSlots })}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-heading text-base font-bold tabular-nums">
          {formatVnd(court.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">
            {ts("perHour")}
          </span>
        </span>
      </div>

      <Button
        size="sm"
        className="rounded-full"
        onClick={() => onBook(court.id)}
      >
        {ta("book")}
      </Button>
    </div>
  )
}

// ─── Player results ───────────────────────────────────────────────────────────

function PlayerChatResult({
  players,
  selectedIds,
  onToggle,
  onOpenProfile,
}: {
  players: PlayerMatchResult[]
  selectedIds: string[]
  onToggle: (p: PlayerMatchResult) => void
  onOpenProfile: (p: PlayerMatchResult) => void
}) {
  if (!players.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No matching players found. Try broadening the area or time.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="pl-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {players.length} players matched
      </p>
      {players.map((player) => (
        <PlayerChatCard
          key={player.id}
          player={player}
          selected={selectedIds.includes(player.id)}
          onToggle={() => onToggle(player)}
          onOpenProfile={() => onOpenProfile(player)}
        />
      ))}
    </div>
  )
}

// ─── Room results (Quick Match) ───────────────────────────────────────────────

function RoomChatResult({
  rooms,
  onJoin,
}: {
  rooms: MatchRoom[]
  onJoin: (room: MatchRoom) => void
}) {
  const t = useTranslations("AiDashboard")
  if (!rooms.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noRoomsFound")}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="pl-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <Zap className="mr-1 inline size-3 text-brand" />
        {t("quickMatchRooms", { count: rooms.length })}
      </p>
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} onJoin={onJoin} />
      ))}
    </div>
  )
}

function RoomCard({
  room,
  onJoin,
}: {
  room: MatchRoom
  onJoin: (room: MatchRoom) => void
}) {
  const t = useTranslations("AiDashboard")
  const { joinedIds, requestedIds } = useSession()
  const open = room.capacity - room.joined
  const isJoined = joinedIds.has(room.id)
  const isRequested = requestedIds.has(room.id)

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading font-semibold text-sm">{room.title}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="size-3 shrink-0" />
            {room.venue} · {room.district} · {room.distanceKm} km
          </p>
        </div>
        <SportTag sport={room.sport} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <LevelChip level={room.level} />
        <Badge variant="outline" className="text-xs">
          {room.format}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3 shrink-0" />
          {room.day} · {room.time}
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3 shrink-0" />
          {t("roomCapacity", { joined: room.joined, capacity: room.capacity })}
          {open > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              · {t("roomSpotsOpen", { count: open })}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2.5">
        <span className="font-heading font-bold tabular-nums text-sm">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">/hr</span>
        </span>
        <Button
          size="sm"
          className="rounded-full"
          variant={isJoined ? "secondary" : "default"}
          disabled={isRequested}
          onClick={() => onJoin(room)}
        >
          {isJoined ? (
            <>
              <CheckCheck className="size-3.5" />
              {t("joined")}
            </>
          ) : isRequested ? (
            t("requested")
          ) : (
            <>
              <LogIn className="size-3.5" />
              {t("joinRoom")}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function PlayerChatCard({
  player,
  selected,
  onToggle,
  onOpenProfile,
}: {
  player: PlayerMatchResult
  selected: boolean
  onToggle: () => void
  onOpenProfile: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenProfile()
        }
      }}
      className="grid cursor-pointer gap-3 rounded-3xl border border-border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-10">
            <AvatarFallback className="bg-secondary text-sm font-semibold text-secondary-foreground">
              {player.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-heading font-semibold">
                {player.name}
              </h3>
              {player.online ? (
                <span className="size-1.5 rounded-full bg-brand" aria-hidden />
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {player.blurb}
            </p>
          </div>
        </div>
        <MatchMeter pct={player.matchPct} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SportTag sport={player.sport} />
        <LevelChip level={player.level} />
        <Badge variant="outline" className="text-xs">
          {player.preferredArea}
        </Badge>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${trustTone(player.trust)}`}
        >
          <Shield className="size-3" />
          {player.trust}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {player.availability[0]}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="truncate text-xs text-muted-foreground">
          {player.reason}
        </p>
        <Button
          size="sm"
          variant={selected ? "secondary" : "default"}
          className="shrink-0 rounded-full"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          {selected ? (
            <CheckCheck className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {selected ? "Selected" : "Select"}
        </Button>
      </div>
    </article>
  )
}

