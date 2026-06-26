"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import {
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import {
  roomChatId,
  useChat as useChatStore,
} from "@/components/dashboard/chat-store"
import { useBooking } from "@/components/dashboard/booking"
import {
  formatVnd,
  type Court,
  type Level,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { LogoMark } from "@/components/logo"
import { type LatLng } from "@/components/dashboard/court-map"
import { Flip, gsap, prefersReducedMotion } from "@/lib/gsap"
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

// Discriminate a tool's output by shape, not by tool name — some models stream
// the tool name too late for the AI SDK to type the part (the part type ends up
// a bare `tool-`), but the output payload is always there and unambiguous.
type ToolResult =
  | { kind: "courts"; value: CourtToolResult }
  | { kind: "players"; value: PlayerToolResult }
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
  if (typeof o.question === "string" && Array.isArray(o.options))
    return { kind: "clarify", value: output as ClarifyToolResult }
  if (typeof o.success === "boolean" && ("bookingId" in o || "reason" in o))
    return { kind: "booking", value: output as BookingToolResult }
  if (
    typeof o.sport === "string" &&
    (o.sport === "badminton" || o.sport === "pickleball") &&
    !("courts" in o) &&
    !("players" in o)
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
  const { courts } = useData()
  const { openBooking } = useBooking()
  const { createInviteRoom, userLevelForSport, userLevels } = useSession()
  const { setActiveChatId } = useChatStore()
  const router = useRouter()

  const [input, setInput] = React.useState("")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [profile, setProfile] = React.useState<PlayerMatchResult | null>(null)
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
  const { messages, sendMessage, status } = useChat()
  const isLoading = status === "streaming" || status === "submitted"

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
      for (const part of (msg.parts ?? []) as Record<string, unknown>[]) {
        const partType = (part.type as string) ?? ""
        if (partType === "dynamic-tool" || partType.startsWith("tool-")) {
          const result = toolResult(part.output)
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
        const type = part.type
        if (type !== "dynamic-tool" && !type.startsWith("tool-")) continue
        if ((part as { state?: string }).state !== "output-available") continue
        const result = toolResult((part as { output?: unknown }).output)
        if (result?.kind === "players") return result.value
      }
    }
    return null
  }, [messages])

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
    sendMessage({ text: trimmed }, { body: { userLevels: activeUserLevels, userLocation } })
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

  const quickPromptsList = [
    t("prompts.badmintonNearMe"),
    t("prompts.cheapestPickleball"),
    t("prompts.badmintonTeammates"),
    t("prompts.sameLevelPlayers"),
  ]

  const quickPrompts = (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {quickPromptsList.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => submit(p)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm sm:text-base text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        >
          {p}
        </button>
      ))}
    </div>
  )

  const profileDialog = (
    <PlayerProfileDialog
      player={profile}
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
      <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-3xl flex-col items-center justify-center gap-7 px-2">
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
            onChoose={submit}
            onTogglePlayer={togglePlayer}
            onOpenProfile={setProfile}
            onBook={(courtId) => {
              if (aiBookedCourtIds.has(courtId)) {
                toast.info("Already booked via chat — check My Bookings.")
                return
              }
              openBooking(courtId)
            }}
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
            <div className="ml-auto flex gap-2">
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
  onChoose,
  onTogglePlayer,
  onOpenProfile,
  onBook,
}: {
  message: UIMessage
  selectedIds: string[]
  interactive: boolean
  onChoose: (text: string) => void
  onTogglePlayer: (p: PlayerMatchResult) => void
  onOpenProfile: (p: PlayerMatchResult) => void
  onBook: (courtId: string) => void
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
        const p = part as Record<string, unknown>

        // Real streamed model reasoning (chain of thought).
        if (p.type === "reasoning") {
          if (!((p.text as string) ?? "").trim()) return null
          return (
            <ThinkingBlock
              key={i}
              text={p.text as string}
              done={p.state !== "streaming"}
            />
          )
        }

        // Plain text
        if (p.type === "text" && p.text) {
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-muted px-5 py-3 text-sm sm:text-base">
                {p.text as string}
              </div>
            </div>
          )
        }

        // Tool part. Statically-defined server tools arrive as
        // `tool-<name>` (ToolUIPart); runtime tools as `dynamic-tool`.
        // NOTE: some models (e.g. tencent/hy3-preview) stream the tool name
        // late, so the part type can be a bare `tool-` with no name. Discriminate
        // by the OUTPUT shape rather than the name so cards always render.
        const partType = p.type as string
        if (partType === "dynamic-tool" || partType.startsWith("tool-")) {
          const isDone = (p.state as string) === "output-available"
          const result = toolResult(p.output)

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

          // Tool call resolving — lightweight searching indicator.
          if (!isDone) {
            const toolName =
              partType === "dynamic-tool"
                ? (p.toolName as string)
                : partType.slice("tool-".length)
            return <SearchingIndicator key={i} toolName={toolName} />
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

// ─── Player profile dialog ────────────────────────────────────────────────────

function PlayerProfileDialog({
  player,
  open,
  onOpenChange,
}: {
  player: PlayerMatchResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0 sm:max-w-2xl">
        {player ? (
          <>
            <DialogHeader className="border-b border-border px-6 py-5 pr-14 text-left sm:px-7">
              <div className="flex items-center gap-4">
                <Avatar className="size-14">
                  <AvatarFallback className="bg-secondary text-base font-semibold text-secondary-foreground">
                    {player.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle className="text-xl font-semibold">
                    {player.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {player.age} years old · {player.location}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-5 p-6 sm:p-7">
              <div className="flex flex-wrap gap-2">
                {player.badges.map((badge) => (
                  <Badge key={badge} variant="secondary">
                    {badge}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Sport"
                  value={player.sportPreferences.join(", ")}
                />
                <Metric label="Skill level" value={player.level} />
                <Metric label="Play style" value={player.playStyle} />
                <Metric label="Availability" value={player.availability[0]} />
                <Metric
                  label="Completed matches"
                  value={String(player.completedMatches)}
                />
                <Metric
                  label="Rating"
                  value={`${player.rating.toFixed(1)} / 5`}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Review snippets
                </p>
                {player.reviewSnippets.map((review) => (
                  <div
                    key={review}
                    className="rounded-2xl border border-border bg-background p-3 text-sm text-muted-foreground"
                  >
                    {review}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-sm font-semibold">{value}</p>
    </div>
  )
}
