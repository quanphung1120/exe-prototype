"use client"

import { CourtDistance } from "@/features/dashboard/court-distance"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  isTextUIPart,
  isReasoningUIPart,
} from "ai"
import type { UIMessage } from "ai"
import { useAuth } from "@clerk/nextjs"
import {
  ArrowLeft,
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
  RotateCcw,
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

import { useBooking } from "@/features/booking/booking"
import {
  activeRoster,
  formatVnd,
  type Court,
  type Level,
  type MatchRoom,
  type PlaySession,
  type SportKey,
} from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import { useSession } from "@/features/play/session"
import {
  CourtImage,
  LevelChip,
  MatchMeter,
  SportTag,
} from "@/features/dashboard/shared"
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
import { DashboardWelcome } from "@/features/dashboard/dashboard-welcome"
import { PlayerProfileDialog } from "@/features/dashboard/profile-dialog"
import { Flip, gsap, prefersReducedMotion } from "@/features/landing/gsap"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"
import { PUBLIC_API_URL } from "@/lib/public-api"
import { useRouter } from "@/i18n/navigation"
import {
  chooseSuggestedCourt,
  summarizeInviteDay,
  type PlayerMatchIntent,
  type PlayerMatchResult,
} from "@/features/play/player-matching"
import {
  readStoredAssessment,
  PLAYER_ASSESSMENT_PATH,
} from "@/features/assessment/player-assessment"

// ─── Types mirroring tool execute return values ───────────────────────────────

interface CourtToolResult {
  courts: Court[]
  sortBy: string
  sport: SportKey | null
  sports?: SportKey[] | null
  filteredByTime?: string | null
  wardMatched?: boolean | null
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
  wardMatched?: boolean | null
}

interface BookingToolResult {
  success: boolean
  bookingId?: string
  courtId?: string
  court?: string
  ward?: string
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
    o.sport === "badminton" &&
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

function buildInviteTitle(intent: PlayerMatchIntent) {
  const label = "Badminton"
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
  const { courts, user: USER, requestLocation } = useData()
  const { openBooking } = useBooking()
  const {
    createInviteRoom,
    addPlayersToSession,
    sessions,
    joinedIds,
    joinRoom,
    userLevelForSport,
    userLevels,
  } = useSession()
  const router = useRouter()

  const [input, setInput] = React.useState("")
  // The thread's back button returns to the regular /app home without
  // discarding the conversation; sending a message (or "Continue") resumes it.
  const [atHome, setAtHome] = React.useState(false)
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
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  // Composer geometry captured in the welcome state, replayed once the first
  // message swaps in the thread layout so the composer glides down rather than
  // snapping to the bottom. See the Flip effect below.
  const composerFlip = React.useRef<ReturnType<typeof Flip.getState> | null>(
    null
  )

  const resolveLocation = requestLocation

  const { getToken } = useAuth()
  // The transport resolves headers per request, so each send attaches a
  // fresh short-lived Clerk token. useChat re-reads `options.transport` on
  // every render internally (via its own ref), so recreating the transport
  // whenever `getToken`'s identity changes is safe — no stale closure risk.
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: `${PUBLIC_API_URL}/api/ai/chat`,
        headers: async () => ({
          Authorization: `Bearer ${(await getToken()) ?? ""}`,
        }),
      }),
    [getToken]
  )
  // AI SDK v6 — sendMessage replaces handleSubmit/append
  const { messages, sendMessage, status, setMessages } = useChat({ transport })
  const isLoading = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    const handleClear = () => {
      setMessages([])
      setAtHome(false)
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

  // ⌘K / Ctrl+K focuses the composer from anywhere on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const showWelcome = messages.length === 0 || atHome

  // Collect court IDs that were successfully booked via the AI chat in this
  // session, so tapping "Book" on an earlier findCourts card doesn't open the
  // wizard and create a duplicate booking for the same court.
  const aiBookedCourtIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts ?? []) {
        if (isToolUIPart(part) && part.state === "output-available") {
          const result = toolResult((part as { output: unknown }).output)
          if (
            result?.kind === "booking" &&
            result.value.success &&
            result.value.courtId
          ) {
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

    // Messages live in the scroller's inner centred column.
    const column = scrollRef.current?.firstElementChild
    const intro = column
      ? gsap.from(column.children, {
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
    if (showWelcome && !prefersReducedMotion()) {
      composerFlip.current = Flip.getState('[data-flip-id="ai-composer"]')
    }
    setAtHome(false)
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
    void sendMessage(
      { text: trimmed },
      { body: { userLevels: activeUserLevels, userLocation, locale } }
    )
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
    // The channel was already created host-only by `createInviteRoom` (via
    // `session.tsx`'s `openRoomChat`) the moment the room was — just deep-link
    // into it.
    router.push(`/app/chat?channel=room-${inviteState.roomId}`)
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

    const inviteTitle = buildInviteTitle(lastPlayerResult.intent)
    setInviteState({ status: "sending", roomId: null })
    inviteTimerRef.current = setTimeout(() => {
      try {
        const roomId = createInviteRoom({
          title: inviteTitle,
          sport: inviteSport,
          format: selectedPlayers.length + 1 >= 4 ? "Doubles" : "Singles",
          courtId: suggestedCourt?.id ?? null,
          venue: suggestedCourt?.name ?? "SportMatch Group",
          ward:
            lastPlayerResult.intent.locationLabel ??
            suggestedCourt?.ward ??
            "Near you",
          distanceKm: suggestedCourt?.distanceKm ?? null,
          dayKey: schedule.dayKey,
          dayLabel: schedule.dayLabel,
          slot: schedule.slot,
          durationMin: 90,
          level:
            lastPlayerResult.intent.targetLevel ??
            userLevelForSport(inviteSport),
          pricePerHour: suggestedCourt?.pricePerHour ?? 0,
          invitees: selectedPlayers.map((p) => p.initials),
        })
        if (!roomId) throw new Error("Unable to create group chat")
        // `createInviteRoom` already created the room's chat (host-only,
        // fire-and-forget) as part of making the room — nothing left to do
        // here before `openGroupChat` deep-links into it.
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
      className="rounded-[2rem] bg-white p-2 shadow-[0_8px_28px_#14205012] ring-1 ring-[#e3eafa] transition-shadow focus-within:ring-2 focus-within:ring-[#2046ed]/40"
    >
      <div className="flex items-end gap-2">
        <Sparkles className="mb-4 ml-3 size-5 shrink-0 text-[#2046ed]" />
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit(input)
            }
          }}
          placeholder={isLoading ? t("thinking") : t("inputPlaceholder")}
          aria-label={t("assistantName")}
          disabled={isLoading}
          className="max-h-32 min-h-12 flex-1 border-0 bg-transparent py-3.5 pr-0 pl-1 text-base shadow-none focus-visible:ring-0 sm:text-lg"
        />
        <kbd className="mb-3.5 hidden shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">
          ⌘K
        </kbd>
        <Button
          type="button"
          size="icon"
          className="mb-1 rounded-full bg-[#2046ed] text-white hover:bg-[#173bc8]"
          aria-label={t("send")}
          onClick={() => void submit(input)}
          disabled={isLoading || !input.trim()}
        >
          <ArrowUp />
        </Button>
      </div>
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

  // Empty state — hero + composer + quick actions + recent chats on the left,
  // bookings/activity/stats rail on the right (xl+). Collapses into the thread
  // layout below as soon as the first message lands.
  if (showWelcome) {
    return (
      <>
        <DashboardWelcome
          composer={composer}
          onPrompt={(text) => void submit(text)}
          onBook={openBooking}
          onResume={messages.length ? () => setAtHome(false) : undefined}
        />
        {profileDialog}
      </>
    )
  }

  // Active conversation — the same player chrome as Play / Bookings (blue +
  // lime on #f6f9ff): an assistant bar on top, the thread scrolling in a
  // centred column, and the invite bar + composer pinned at the bottom.
  return (
    <div className="player-play flex h-full flex-col bg-[#f6f9ff] text-[#0b1224]">
      <div className="shrink-0 border-b border-[#eaf0fc] bg-white/80">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAtHome(true)}
            aria-label={t("backHome")}
            title={t("backHome")}
            className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-5" />
          </button>
          <AiAvatar className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base leading-tight font-black">
              {t("assistantName")}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="size-3 animate-spin text-brand" />
                  {t("thinking")}
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-[#22c55e]" />
                  {t("assistantOnline")}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("clear-ai-chat"))
            }
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 border-lime px-3.5 text-xs font-bold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">{t("clearChat")}</span>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.map((msg, index) => (
            <ChatMessageRow
              key={msg.id}
              message={msg}
              selectedIds={selectedIds}
              // Only the latest turn's clarify chips stay tappable, and never
              // while a response is streaming.
              interactive={!isLoading && index === messages.length - 1}
              isStreaming={isLoading && index === messages.length - 1}
              onChoose={(text) => void submit(text)}
              onTogglePlayer={togglePlayer}
              onOpenProfile={(p) => setProfile(p.initials)}
              onBook={(courtId) => {
                if (aiBookedCourtIds.has(courtId)) {
                  toast.info(t("alreadyBooked"))
                  return
                }
                openBooking(courtId)
              }}
              onJoinRoom={joinRoom}
            />
          ))}

          {/* Pulse while waiting for first token */}
          {isLoading && messages[messages.length - 1]?.role === "user" ? (
            <div className="flex items-start gap-3">
              <AiAvatar />
              <div className={cn(AI_BUBBLE, "flex items-center gap-2")}>
                <Loader2 className="size-3.5 animate-spin text-brand" />
                {t("thinking")}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-2 px-4 pt-2 pb-4 sm:px-6">
        {lastPlayerResult ? (
          <div className="rounded-3xl border border-[#eaf0fc] bg-white px-3.5 py-2.5 shadow-[0_3px_16px_#14205008]">
            <div className="flex flex-wrap items-center gap-2">
              {selectedPlayers.length ? (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("selectedCount", { count: selectedPlayers.length })}
                  </span>
                  {selectedPlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayer(p)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#f4f7fc] px-2.5 py-1 text-xs font-semibold text-[#173bc8] transition-colors hover:bg-lime/40"
                    >
                      {p.name}
                      <X className="size-3" />
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
                    onClick={() => void openGroupChat()}
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
                        <DropdownMenuContent
                          align="end"
                          className="player-play-overlay w-56"
                        >
                          {eligibleRooms.map((room) => {
                            const open =
                              room.capacity - activeRoster(room).length
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
                                    {room.dayLabel} ·{" "}
                                    {t("roomSpotsOpen", { count: open })}
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
                        !selectedPlayers.length ||
                        inviteState.status === "sending"
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

        {composer}
      </div>

      {profileDialog}
    </div>
  )
}

// ─── Shared chat chrome ───────────────────────────────────────────────────────

/** White assistant bubble — the AI's side of the thread. */
const AI_BUBBLE =
  "max-w-[85%] rounded-3xl rounded-tl-md border border-[#eaf0fc] bg-white px-5 py-3 text-sm text-[#0b1224] shadow-[0_3px_16px_#14205008] sm:text-base"

/** Option chip the user taps to answer (clarify / retry suggestions). */
const CHOICE_CHIP =
  "inline-flex items-center rounded-full border-2 border-lime bg-white px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-lime/30 disabled:cursor-not-allowed disabled:opacity-50"

/** Small heading above a block of tool results (courts / players / rooms). */
const RESULT_LABEL =
  "flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-[#596783] uppercase"

/** White result card, matching the court/room cards on Play. */
const RESULT_CARD =
  "rounded-3xl border border-[#eaf0fc] bg-white shadow-[0_3px_16px_#14205008]"

/** The assistant's avatar: a lime disc with the sparkle mark. */
function AiAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-[#a5ff12] text-[#173bc8] shadow-[0_4px_12px_#a5ff1255]",
        className
      )}
    >
      <Sparkles className="size-[45%]" />
    </span>
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
        <div className="max-w-[85%] rounded-3xl rounded-tr-md bg-[#2046ed] px-5 py-3 text-sm whitespace-pre-wrap text-white shadow-[0_6px_18px_#2046ed2e] sm:text-base">
          {text}
        </div>
      </div>
    )
  }

  if (message.role !== "assistant") return null

  const parts = message.parts ?? []

  return (
    <div className="flex items-start gap-3">
      <AiAvatar className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                <div className={AI_BUBBLE}>
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
    <div className="rounded-3xl border border-dashed border-[#d6e0f7] bg-white/70 p-3">
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
            "mt-2.5 no-scrollbar max-h-44 overflow-y-auto pr-1 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground sm:text-sm",
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
    <div className="flex items-center gap-2 self-start rounded-full border border-[#eaf0fc] bg-white px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-[0_3px_16px_#14205008] sm:text-sm">
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
        <div className={AI_BUBBLE}>{question}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className={CHOICE_CHIP}
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
        <div className={AI_BUBBLE}>
          {t("requireAssessment", { sport: tc(`sports.${sport}`) })}
        </div>
      </div>
      <div>
        <Button
          onClick={() => router.push(PLAYER_ASSESSMENT_PATH)}
          className="h-10 rounded-full bg-lime px-5 text-sm font-bold text-lime-foreground hover:bg-lime/90"
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
  const t = useTranslations("AiDashboard")
  if (!booking.success) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-start">
          <div className={cn(AI_BUBBLE, "text-muted-foreground")}>
            {booking.reason ?? t("bookingFailed")}
          </div>
        </div>
        {booking.suggestTime ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChoose(t("bookAtInstead", { time: booking.suggestTime! }))
              }
              className={CHOICE_CHIP}
            >
              <Clock className="mr-1.5 size-3.5" />
              {t("tryTime", { time: booking.suggestTime })}
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
    hrs > 0 && rem > 0 ? `${hrs}h ${rem}m` : hrs > 0 ? `${hrs}h` : `${rem}m`

  return (
    <div className="relative isolate flex max-w-md flex-col gap-3 overflow-hidden rounded-3xl bg-[#2046ed] p-5 text-white shadow-[0_10px_30px_#2046ed33]">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 -z-10 size-32 rounded-full border-[16px] border-[#a5ff12]/20"
      />
      <div className="flex items-center gap-2">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#a5ff12] text-[#173bc8]">
          <CheckCheck className="size-3.5" />
        </div>
        <span className="text-[11px] font-bold tracking-[0.14em] text-[#a5ff12] uppercase">
          {t("bookingConfirmed")}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-lg leading-snug font-black">
          {booking.court}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/80 sm:text-sm">
          <MapPin className="size-3.5 shrink-0" />
          {booking.ward}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/80 sm:text-sm">
          <Clock className="size-3.5 shrink-0" />
          {booking.date} · {booking.time} · {durationLabel}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-white/15 pt-3">
        <span className="font-mono text-[10px] tracking-wider text-white/70 uppercase sm:text-xs">
          {booking.bookingId}
        </span>
        <span className="font-heading text-lg font-black text-[#a5ff12] tabular-nums">
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
      <p className={RESULT_LABEL}>
        <MapPin className="size-3.5 text-brand" />
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
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f6f9ff] to-transparent" />
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label={t("prevResults")}
              className="absolute top-1/2 left-1 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border-2 border-lime bg-white text-brand shadow-md transition-colors hover:bg-lime"
            >
              <ChevronLeft className="size-4" />
            </button>
          </>
        ) : null}
        {!atEnd ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f6f9ff] to-transparent" />
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label={t("nextResults")}
              className="absolute top-1/2 right-1 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border-2 border-lime bg-white text-brand shadow-md transition-colors hover:bg-lime"
            >
              <ChevronRight className="size-4" />
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
        RESULT_CARD,
        "flex shrink-0 snap-start flex-col gap-3 p-3",
        solo ? "w-full max-w-sm" : "w-64"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#f4f7fc]">
        <CourtImage
          court={court}
          className="absolute inset-0 h-full w-full"
          sizes="384px"
        />
        <span className="absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-full bg-[#a5ff12] px-2 text-xs font-black text-[#173bc8] shadow">
          #{rank}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="truncate font-heading text-base font-bold">
          {court.name}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {court.ward} · <CourtDistance courtId={court.id} />
        </p>
        <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#f4f7fc] px-2 py-0.5 text-xs font-semibold">
          <Star className="size-3 fill-[#f5b400] text-[#f5b400]" />
          {court.rating}
          <span className="text-[10px] font-medium text-muted-foreground">
            {tf(`score.${scoreWord}`)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[#16a34a]">
          <Clock className="size-3 shrink-0" />
          {tad("availableFrom", { time: court.nextSlot })}
          <span className="font-normal text-muted-foreground">
            · {tad("slotsOpen", { count: court.openSlots })}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#eaf0fc] pt-3">
        <span className="font-heading text-lg font-black text-brand tabular-nums">
          {formatVnd(court.pricePerHour)}
          <span className="text-xs font-medium text-muted-foreground">
            {ts("perHour")}
          </span>
        </span>
        <Button
          size="sm"
          className="h-9 rounded-full bg-lime px-4 font-bold text-lime-foreground hover:bg-lime/90"
          onClick={() => onBook(court.id)}
        >
          {ta("book")}
        </Button>
      </div>
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
  const t = useTranslations("AiDashboard")
  if (!players.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[#d6e0f7] bg-white px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noPlayersFound")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className={RESULT_LABEL}>
        <Users className="size-3.5 text-brand" />
        {t("playersMatched", { count: players.length })}
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
      <div className="rounded-3xl border border-dashed border-[#d6e0f7] bg-white px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noRoomsFound")}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className={RESULT_LABEL}>
        <Zap className="size-3.5 text-brand" />
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
  const tm = useTranslations("MatchMaker")
  const ts = useTranslations("Shared")
  const { joinedIds, requestedIds } = useSession()
  const open = room.capacity - room.joined
  const isJoined = joinedIds.has(room.id)
  const isRequested = requestedIds.has(room.id)

  return (
    <div className={cn(RESULT_CARD, "flex flex-col gap-3 p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 truncate font-heading text-sm font-semibold">
            <span className="truncate">{room.title}</span>
            {room.demo ? (
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                title={tm("demoJoin")}
              >
                {tm("demoBadge")}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {room.venue ? (
              <>
                {room.venue} · {room.ward} ·{" "}
                <CourtDistance courtId={room.courtId} venue={room.venue} />
              </>
            ) : (
              tm("dialog.noCourt")
            )}
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
            <span className="font-semibold text-[#16a34a]">
              · {t("roomSpotsOpen", { count: open })}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-[#eaf0fc] pt-3">
        <span className="font-heading text-base font-black text-brand tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-medium text-muted-foreground">
            {ts("perHour")}
          </span>
        </span>
        <Button
          size="sm"
          className="h-9 rounded-full px-4 font-bold"
          variant={isJoined ? "secondary" : room.demo ? "outline" : "default"}
          disabled={isRequested || room.demo}
          title={room.demo ? tm("demoJoin") : undefined}
          onClick={() => onJoin(room)}
        >
          {isJoined ? (
            <>
              <CheckCheck className="size-3.5" />
              {t("joined")}
            </>
          ) : isRequested ? (
            t("requested")
          ) : room.demo ? (
            tm("demoBadge")
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
  const t = useTranslations("AiDashboard")
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
      className={cn(
        RESULT_CARD,
        "grid cursor-pointer gap-3 p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "border-[#2046ed] ring-2 ring-[#2046ed]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-11">
            <AvatarFallback className="bg-[#2046ed] text-sm font-bold text-[#a5ff12]">
              {player.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-heading font-bold">{player.name}</h3>
              {player.online ? (
                <span
                  className="size-2 rounded-full bg-[#22c55e]"
                  aria-hidden
                />
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
        <Badge className="bg-[#f4f7fc] text-xs text-[#173bc8]">
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

      <div className="flex items-center justify-between gap-2 border-t border-[#eaf0fc] pt-3">
        <p className="truncate text-xs text-muted-foreground">
          {player.reason}
        </p>
        <Button
          size="sm"
          aria-pressed={selected}
          className={cn(
            "h-9 shrink-0 rounded-full px-4 font-bold",
            selected
              ? "bg-[#2046ed] text-white hover:bg-[#173bc8]"
              : "bg-lime text-lime-foreground hover:bg-lime/90"
          )}
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
          {selected ? t("selected") : t("select")}
        </Button>
      </div>
    </article>
  )
}
