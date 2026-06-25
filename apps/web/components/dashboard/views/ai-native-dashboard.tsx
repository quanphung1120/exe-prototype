"use client"

import * as React from "react"
import {
  ArrowUp,
  CalendarCheck,
  CheckCheck,
  CircleHelp,
  Clock,
  MapPin,
  Mic,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { roomChatId, useChat } from "@/components/dashboard/chat-store"
import { useBooking } from "@/components/dashboard/booking"
import {
  formatVnd,
  type Court,
  type Level,
  type SportKey,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useSession } from "@/components/dashboard/session"
import { useSportFilter } from "@/components/dashboard/sport-filter"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useRouter } from "@/i18n/navigation"
import {
  chooseSuggestedCourt,
  detectAiIntent,
  findMatchedPlayers,
  summarizeInviteDay,
  type PlayerMatchIntent,
  type PlayerMatchResult,
} from "@/lib/player-matching"

type PlanMode = "best" | "near" | "budget" | "team"

interface AiPlan {
  prompt: string
  mode: PlanMode
  sport: SportKey | null
  courts: Court[]
  summary: string
}

type AiResponse =
  | {
      kind: "court"
      plan: AiPlan
    }
  | {
      kind: "player"
      prompt: string
      intent: PlayerMatchIntent
      players: PlayerMatchResult[]
    }

const QUICK_PROMPTS = [
  "Find badminton teammates tonight",
  "Find pickleball players near me",
  "Match me with same-level players",
  "Create a group for this weekend",
]

function detectPlan(
  prompt: string,
  courts: Court[],
  selectedSport: SportKey | "all"
): AiPlan {
  const q = prompt.toLowerCase()
  const sport =
    [
      { key: "badminton" as const, labels: ["badminton", "cầu lông", "cau long"] },
      { key: "pickleball" as const, labels: ["pickleball", "pickle"] },
    ].find((item) => item.labels.some((label) => q.includes(label)))?.key ??
    (selectedSport === "all" ? null : selectedSport)

  const mode: PlanMode = /cheap|budget|low|price|affordable/.test(q)
    ? "budget"
    : /near|close|closest|nearby|distance/.test(q)
      ? "near"
      : /team|teammate|partner|player|double|fill/.test(q)
        ? "team"
        : "best"

  const pool = courts.filter((court) => !sport || court.sports.includes(sport))
  const candidates = pool.length ? pool : courts
  const ranked = [...candidates].sort((a, b) => {
    if (mode === "budget") return a.pricePerHour - b.pricePerHour
    if (mode === "near") return a.distanceKm - b.distanceKm
    if (mode === "team") return b.openSlots - a.openSlots || b.rating - a.rating
    return b.rating - a.rating || a.distanceKm - b.distanceKm
  })

  const summary =
    mode === "budget"
      ? "I ranked courts by lowest hourly price, then checked rating and open slots."
      : mode === "near"
        ? "I prioritized short travel time and kept only courts with usable slots."
        : mode === "team"
          ? "I looked for courts with enough open capacity to start a booking and fill seats."
          : "I balanced rating, availability, travel time, and price for the strongest booking option."

  return {
    prompt,
    mode,
    sport,
    courts: ranked.slice(0, 3),
    summary,
  }
}

function trustTone(trust: number) {
  if (trust >= 90) return "bg-brand/10 text-brand"
  if (trust >= 80) return "bg-secondary text-secondary-foreground"
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

function buildInviteTitle(intent: PlayerMatchIntent, sport: SportKey) {
  const sportLabel = sport === "badminton" ? "Badminton" : "Pickleball"
  if (intent.timeLabel) return `${sportLabel} ${intent.timeLabel} group`
  if (intent.locationLabel) return `${sportLabel} ${intent.locationLabel} group`
  return `${sportLabel} teammate group`
}

export function AiNativeDashboardView() {
  const tc = useTranslations("Common")
  const { courts, players } = useData()
  const { sport } = useSportFilter()
  const { openBooking, openPlay } = useBooking()
  const { createInviteRoom, userLevelForSport, userName } = useSession()
  const { setActiveChatId } = useChat()
  const router = useRouter()

  const [draft, setDraft] = React.useState("")
  const [response, setResponse] = React.useState<AiResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [profile, setProfile] = React.useState<PlayerMatchResult | null>(null)
  const [inviteState, setInviteState] = React.useState<{
    status: "idle" | "sending" | "sent"
    roomId: string | null
  }>({ status: "idle", roomId: null })

  const loadingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const inviteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current)
    }
  }, [])

  const playerResponse = response?.kind === "player" ? response : null
  const courtResponse = response?.kind === "court" ? response.plan : null
  const bestCourt = courtResponse?.courts[0] ?? courts[0]

  const selectedPlayers = React.useMemo(
    () =>
      playerResponse
        ? playerResponse.players.filter((player) => selectedIds.includes(player.id))
        : [],
    [playerResponse, selectedIds]
  )

  const clearPendingTimers = () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current)
      inviteTimerRef.current = null
    }
  }

  const runCourtPlan = (prompt: string) => {
    setLoading(false)
    setResponse({
      kind: "court",
      plan: detectPlan(prompt, courts, sport),
    })
  }

  const runPlayerMatch = (prompt: string) => {
    const defaultSport = sport === "all" ? "badminton" : sport
    setLoading(true)
    loadingTimerRef.current = setTimeout(() => {
      const { intent, matches } = findMatchedPlayers(
        prompt,
        players,
        sport,
        userLevelForSport(defaultSport)
      )

      setResponse({
        kind: "player",
        prompt,
        intent,
        players: matches,
      })
      setLoading(false)
      loadingTimerRef.current = null
    }, 850)
  }

  const submit = (value = draft) => {
    const prompt = value.trim()
    if (!prompt) {
      toast.error("Prompt cannot be empty.")
      return
    }

    clearPendingTimers()
    setSelectedIds([])
    setInviteState({ status: "idle", roomId: null })
    setProfile(null)
    setDraft("")

    if (detectAiIntent(prompt) === "player") {
      runPlayerMatch(prompt)
      return
    }

    runCourtPlan(prompt)
  }

  const togglePlayer = (player: PlayerMatchResult) => {
    setSelectedIds((prev) =>
      prev.includes(player.id)
        ? prev.filter((id) => id !== player.id)
        : [...prev, player.id]
    )
  }

  const removeSelected = (playerId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== playerId))
  }

  const openGroupChat = () => {
    if (!inviteState.roomId) return
    setActiveChatId(roomChatId(inviteState.roomId))
    router.push("/dashboard/chat")
  }

  const inviteToChat = () => {
    if (!playerResponse) return
    if (!selectedPlayers.length) {
      toast.error("Select at least one player before sending an invite.")
      return
    }

    const inviteSport =
      playerResponse.intent.sport ?? selectedPlayers[0]?.sport ?? "badminton"
    const suggestedCourt = chooseSuggestedCourt(
      courts,
      inviteSport,
      playerResponse.intent.locationLabel
    )
    const schedule = summarizeInviteDay(playerResponse.intent.timeKey)

    setInviteState({ status: "sending", roomId: null })
    inviteTimerRef.current = setTimeout(() => {
      try {
        const roomId = createInviteRoom({
          title: buildInviteTitle(playerResponse.intent, inviteSport),
          sport: inviteSport,
          format: selectedPlayers.length + 1 >= 4 ? "Doubles" : "Singles",
          courtId: suggestedCourt?.id ?? null,
          venue: suggestedCourt?.name ?? "SportMatch Group",
          district:
            playerResponse.intent.locationLabel ??
            suggestedCourt?.district ??
            "Near you",
          distanceKm: suggestedCourt?.distanceKm ?? selectedPlayers[0]?.distanceKm ?? 1,
          dayKey: schedule.dayKey,
          dayLabel: schedule.dayLabel,
          slot: schedule.slot,
          durationMin: 90,
          level:
            (playerResponse.intent.targetLevel as Level | null) ??
            userLevelForSport(inviteSport),
          pricePerHour: suggestedCourt?.pricePerHour ?? 0,
          invitees: selectedPlayers.map((player) => player.initials),
        })

        if (!roomId) {
          throw new Error("Unable to create group chat")
        }

        setInviteState({ status: "sent", roomId })
        toast.success("Invitation sent", {
          description: "Group chat created. Waiting for players to accept.",
        })
      } catch {
        setInviteState({ status: "idle", roomId: null })
        toast.error("Failed to send invite to group chat.")
      } finally {
        inviteTimerRef.current = null
      }
    }, 700)
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8.5rem)] w-full max-w-6xl flex-col">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center lg:py-12">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="size-3.5 text-brand" />
            SportMatch AI booking and matching
          </span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Find a court or match the right players
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Ask for court recommendations or teammate matching in the same AI flow.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="w-full max-w-3xl"
        >
          <div className="rounded-[2rem] border border-border bg-background p-2 shadow-xl shadow-foreground/5">
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="mb-1 rounded-full"
                aria-label="Add booking context"
              >
                <Plus />
              </Button>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder="Ask AI to book courts or match teammates for your group"
                aria-label="Ask SportMatch AI"
                className="max-h-32 min-h-12 flex-1 border-0 bg-transparent px-0 py-3 text-base shadow-none focus-visible:ring-0"
              />
              <div className="mb-1 hidden items-center gap-1 sm:flex">
                <span className="rounded-full px-2 text-sm text-muted-foreground">
                  High
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="rounded-full"
                  aria-label="Voice input"
                >
                  <Mic />
                </Button>
              </div>
              <Button
                type="submit"
                size="icon"
                className="mb-1 rounded-full bg-foreground text-background hover:bg-foreground/90"
                aria-label="Run AI search"
                disabled={!draft.trim()}
              >
                <ArrowUp />
              </Button>
            </div>
          </div>
        </form>

        <div className="flex max-w-3xl flex-wrap justify-center gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submit(prompt)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              {prompt.includes("same-level") ? (
                <SlidersHorizontal className="size-4" />
              ) : prompt.includes("group") ? (
                <Users className="size-4" />
              ) : (
                <Search className="size-4" />
              )}
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {loading ? <PlayerMatchSkeleton /> : null}

      {courtResponse && bestCourt ? (
        <section className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-left">
                <p className="text-sm font-medium text-muted-foreground">
                  AI plan for
                </p>
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  "{courtResponse.prompt}"
                </h2>
              </div>
              <Button
                className="rounded-full"
                onClick={() =>
                  openBooking(bestCourt.id, {
                    fillMode: courtResponse.mode === "team" ? "find" : "court",
                  })
                }
              >
                <CalendarCheck />
                Book best match
              </Button>
            </div>

            <div className="grid gap-3">
              {courtResponse.courts.map((court, index) => (
                <AiCourtResult
                  key={court.id}
                  court={court}
                  rank={index + 1}
                  mode={courtResponse.mode}
                  sportLabel={
                    courtResponse.sport
                      ? tc(`sports.${courtResponse.sport}`)
                      : undefined
                  }
                  onBook={() =>
                    openBooking(court.id, {
                      fillMode: courtResponse.mode === "team" ? "find" : "court",
                    })
                  }
                />
              ))}
            </div>
          </div>

          <aside className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-4 shadow-md shadow-foreground/5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-brand/12 text-brand">
                <Zap className="size-4" />
              </span>
              <div className="min-w-0 text-left">
                <p className="font-heading text-sm font-semibold">
                  AI native flow
                </p>
                <p className="text-xs text-muted-foreground">
                  Recommend, book, then fill seats
                </p>
              </div>
            </div>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>{courtResponse.summary}</p>
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="font-medium text-foreground">Next action</p>
                <p>
                  {courtResponse.mode === "team"
                    ? "Open the booking wizard in teammate-finding mode."
                    : "Open the booking wizard with this court preselected."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Best rating" value={bestCourt.rating.toFixed(1)} />
                <Metric label="Open slots" value={String(bestCourt.openSlots)} />
                <Metric label="Distance" value={`${bestCourt.distanceKm}km`} />
                <Metric label="From" value={formatVnd(bestCourt.pricePerHour)} />
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-auto rounded-full"
              onClick={openPlay}
            >
              <Users />
              Choose play mode
            </Button>
          </aside>
        </section>
      ) : null}

      {playerResponse ? (
        <section className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-left">
                <p className="text-sm font-medium text-muted-foreground">
                  AI player match for
                </p>
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  "{playerResponse.prompt}"
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Users className="size-4 text-brand" />
                {selectedPlayers.length} players selected
              </div>
            </div>

            {playerResponse.players.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {playerResponse.players.map((player) => (
                  <PlayerMatchCard
                    key={player.id}
                    player={player}
                    selected={selectedIds.includes(player.id)}
                    onToggle={() => togglePlayer(player)}
                    onOpenProfile={() => setProfile(player)}
                  />
                ))}
              </div>
            ) : (
              <PlayerEmptyState />
            )}
          </div>

          <aside className="flex flex-col gap-4 rounded-3xl border border-border bg-background p-4 shadow-md shadow-foreground/5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-brand/12 text-brand">
                <Users className="size-4" />
              </span>
              <div className="min-w-0 text-left">
                <p className="font-heading text-sm font-semibold">
                  Player matching
                </p>
                <p className="text-xs text-muted-foreground">
                  Match, invite, then move into chat
                </p>
              </div>
            </div>

            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                {playerResponse.intent.sport
                  ? `Prioritizing ${tc(`sports.${playerResponse.intent.sport}`)} players`
                  : "Matching across available sports"}
                {playerResponse.intent.timeLabel
                  ? `, available ${playerResponse.intent.timeLabel.toLowerCase()}.`
                  : "."}
              </p>

              {selectedPlayers.length ? (
                <div className="rounded-2xl bg-muted/60 p-3">
                  <p className="font-medium text-foreground">Selected players</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedPlayers.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => removeSelected(player.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                      >
                        {player.name}
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-muted/60 p-3 text-sm">
                  Select one or more players to create an invite thread.
                </div>
              )}

              <div className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  Trust score
                  <TrustTooltip />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Match percentage combines sport fit, level, area, time, and reputation.
                </p>
              </div>

              {inviteState.status === "sent" ? (
                <div className="rounded-2xl bg-brand/10 p-3 text-sm text-brand">
                  <div className="flex items-start gap-2">
                    <CheckCheck className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Invitation sent</p>
                      <p>Group chat created</p>
                      <p>Waiting for players to accept</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Button
                className="rounded-full"
                onClick={inviteToChat}
                disabled={
                  !selectedPlayers.length || inviteState.status === "sending"
                }
              >
                <Users />
                {inviteState.status === "sending"
                  ? "Sending invite..."
                  : "Invite to group chat"}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={openGroupChat}
                disabled={!inviteState.roomId}
              >
                <Sparkles />
                Open group chat
              </Button>
            </div>
          </aside>
        </section>
      ) : null}

      <PlayerProfileDialog
        player={profile}
        open={Boolean(profile)}
        onOpenChange={(open) => {
          if (!open) setProfile(null)
        }}
      />
    </div>
  )
}

function PlayerMatchCard({
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
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpenProfile()
        }
      }}
      className="grid cursor-pointer gap-4 rounded-3xl border border-border bg-background p-4 text-left shadow-md shadow-foreground/5 transition-shadow hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
              {player.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-lg font-semibold">
                {player.name}
              </h3>
              {player.online ? (
                <span className="size-2 rounded-full bg-brand" aria-hidden />
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{player.blurb}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <MatchMeter pct={player.matchPct} />
          <p className="text-[11px] font-medium text-muted-foreground">
            Match score
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SportTag sport={player.sport} />
        <LevelChip level={player.level} />
        <Badge variant="outline">{player.preferredArea}</Badge>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${trustTone(player.trust)}`}
        >
          <Shield className="size-3" />
          {player.trust}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Signal icon={Clock} label="Available" value={player.availability[0]} />
        <Signal icon={MapPin} label="Area" value={player.location} />
      </div>

      <div className="rounded-2xl bg-muted/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Match reason
          </p>
          <span className="text-xs text-muted-foreground">
            {player.matchPct}% based on sport, level, area, time, and trust
          </span>
        </div>
        <p className="mt-1 text-sm text-foreground">{player.reason}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpenProfile()
          }}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-base font-medium text-brand transition-colors hover:bg-brand/10"
        >
          View full profile
        </button>
        <Button
          className="min-h-11 rounded-full px-5 text-base"
          variant={selected ? "secondary" : "default"}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          {selected ? <CheckCheck /> : <Plus />}
          {selected ? "Selected" : "Select"}
        </Button>
      </div>
    </article>
  )
}

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
      <DialogContent className="font-montserrat max-h-[85vh] overflow-y-auto p-0 sm:max-w-2xl">
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
                <Metric label="Sport" value={player.sportPreferences.join(", ")} />
                <Metric label="Skill level" value={player.level} />
                <Metric label="Play style" value={player.playStyle} />
                <Metric label="Availability" value={player.availability[0]} />
                <Metric label="Completed matches" value={String(player.completedMatches)} />
                <Metric label="Rating" value={`${player.rating.toFixed(1)} / 5`} />
              </div>

              <div className="rounded-2xl bg-muted/60 p-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  Reputation score
                  <TrustTooltip />
                </div>
                <p className="mt-2 text-2xl font-semibold text-brand">
                  {player.trust}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Review snippets</p>
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

function TrustTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Trust score explanation"
          />
        }
      >
        <CircleHelp className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>
        Reputation score is based on completed matches, ratings, punctuality, and
        user reviews.
      </TooltipContent>
    </Tooltip>
  )
}

function PlayerMatchSkeleton() {
  return (
    <section className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-3xl border border-border bg-background p-4 shadow-md shadow-foreground/5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="size-11 rounded-full" />
            </div>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-16 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-border bg-background p-4 shadow-md shadow-foreground/5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-20 w-full" />
        <Skeleton className="mt-3 h-20 w-full" />
        <Skeleton className="mt-6 h-10 w-full rounded-full" />
      </div>
    </section>
  )
}

function PlayerEmptyState() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-background px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Users className="size-5" />
      </div>
      <p className="font-medium text-foreground">No matching players found</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Try a broader area, remove the time constraint, or switch sport keywords.
      </p>
    </div>
  )
}

function AiCourtResult({
  court,
  rank,
  mode,
  sportLabel,
  onBook,
}: {
  court: Court
  rank: number
  mode: PlanMode
  sportLabel?: string
  onBook: () => void
}) {
  const reason =
    mode === "budget"
      ? "Lowest price in the current recommendation set"
      : mode === "near"
        ? "Shortest travel distance with available time"
        : mode === "team"
          ? "Enough open slots to book and fill a group"
          : "Best blend of rating, distance, and availability"

  return (
    <article className="grid overflow-hidden rounded-3xl border border-border bg-background text-left shadow-md shadow-foreground/5 transition-shadow hover:shadow-lg sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="relative min-h-40 sm:min-h-full">
        <CourtImage court={court} className="absolute inset-0 h-full w-full" />
        <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
          #{rank} match
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-lg font-semibold">
              {court.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">
                {court.district} / {court.distanceKm} km
              </span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold text-secondary-foreground">
            <Star className="size-4 fill-lime text-lime" />
            {court.rating}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {court.sports.map((sport) => (
            <SportTag key={sport} sport={sport} />
          ))}
          {sportLabel ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {sportLabel} intent
            </span>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Signal icon={Clock} label="Next slot" value={court.nextSlot} />
          <Signal label="Open today" value={`${court.openSlots} slots`} />
          <Signal label="Price" value={`${formatVnd(court.pricePerHour)}/h`} />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="max-w-xl text-sm text-muted-foreground">{reason}</p>
          <Button className="rounded-full" onClick={onBook}>
            <CalendarCheck />
            Book this
          </Button>
        </div>
      </div>
    </article>
  )
}

function Signal({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
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
