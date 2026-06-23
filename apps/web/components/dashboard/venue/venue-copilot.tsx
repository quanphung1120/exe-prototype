"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AnimatePresence, motion } from "framer-motion"
import {
  BadgePercent,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Flame,
  Loader2,
  Send,
  Sparkles,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SCHEDULE_HOURS,
  formatVnd,
  type ScheduleSlot,
} from "@/components/dashboard/venue/data"
import { useVenueData } from "@/components/dashboard/venue-data-provider"

// Delay between each fake "chain of thought" step revealing.
const STEP_MS = 600

type Translator = ReturnType<typeof useTranslations>

/** A small piece of evidence the planner attaches to its reply. */
type Finding =
  | { kind: "stat"; icon: LucideIcon; label: string; value: string }
  | { kind: "note"; icon: LucideIcon; text: string }

interface PlanResult {
  steps: string[]
  reply: string
  findings: Finding[]
  /** Cosmetic action chip rendered under the result, if any. */
  action?: string
}

type Msg =
  | { id: string; role: "user" | "assistant"; type: "text"; text: string }
  | {
      id: string
      role: "assistant"
      type: "thinking"
      steps: string[]
      revealed: number
      done: boolean
      seconds: string
      collapsed: boolean
    }
  | {
      id: string
      role: "assistant"
      type: "result"
      reply: string
      findings: Finding[]
      action?: string
    }

const SUGGESTION_KEYS = ["free", "revenue", "peak", "promo"] as const

const todayPeakHour = (hour: string) =>
  SCHEDULE_HOURS.indexOf(hour) >= SCHEDULE_HOURS.indexOf("17:00")

/** The record-bound helpers the planner needs, supplied from useVenueData(). */
interface PlannerData {
  PEAK_HOURS: ReturnType<typeof useVenueData>["peakHours"]
  REVENUE_SERIES: ReturnType<typeof useVenueData>["revenueSeries"]
  VENUE: ReturnType<typeof useVenueData>["venue"]
  courtById: ReturnType<typeof useVenueData>["courtById"]
  venueScheduleFor: ReturnType<typeof useVenueData>["venueScheduleFor"]
}

/**
 * Deterministic, operator-flavored "AI" planner. Light keyword matching on the
 * prompt routes to one of a handful of intents; each builds its reasoning,
 * reply and findings purely from the static venue data (no Date/random), so it
 * reads identically on every run. All chrome text is localized via the passed-in
 * translator; data values (court names, hours, money) are spliced in as params.
 */
function runQuery(
  prompt: string,
  t: Translator,
  data: PlannerData
): PlanResult {
  const { PEAK_HOURS, REVENUE_SERIES, VENUE, courtById, venueScheduleFor } =
    data

  /** Tonight's free, peak-hour slots from the live "today" grid. */
  const freePeakSlots = (): ScheduleSlot[] =>
    venueScheduleFor("today")
      .flat()
      .filter((s) => s.kind === "free" && !s.past && todayPeakHour(s.hour))

  const q = prompt.toLowerCase()

  const wantsFree = /free|idle|empty|open|vacan|trống|trong|rảnh|slot/.test(q)
  const wantsRevenue = /revenue|sales|earn|income|money|doanh thu|tiền/.test(q)
  const wantsPromo =
    /promo|discount|off.?peak|offer|deal|khuyến mãi|ưu đãi|giảm giá|thấp điểm/.test(
      q
    )
  const wantsPeak = /peak|busy|rush|prime|cao điểm|đông|giờ vàng/.test(q)

  // ── Free / idle slots tonight ──────────────────────────────────────────────
  if (wantsFree) {
    const slots = freePeakSlots()
    const examples = slots.slice(0, 3).map((s) => {
      const court = courtById(s.courtId)
      return `${court?.name ?? s.courtId} · ${s.hour}`
    })
    const steps = [
      t("steps.scanGrid", { window: `${VENUE.now}–${VENUE.openTo}` }),
      t("steps.filterFree"),
      t("steps.crossPeak"),
      t("steps.draftFix"),
    ]
    const reply = slots.length
      ? t("reply.free", { count: slots.length })
      : t("reply.freeNone")
    const findings: Finding[] = examples.map((label) => ({
      kind: "note" as const,
      icon: Clock,
      text: label,
    }))
    return {
      steps,
      reply,
      findings,
      action: slots.length ? t("actions.offPeak") : undefined,
    }
  }

  // ── Revenue summary ─────────────────────────────────────────────────────────
  if (wantsRevenue) {
    const today = REVENUE_SERIES[REVENUE_SERIES.length - 1]?.value ?? 0
    const week = REVENUE_SERIES.reduce((sum, d) => sum + d.value, 0)
    const avg = REVENUE_SERIES.length
      ? Math.round(week / REVENUE_SERIES.length)
      : 0
    // Guard the zero-activity venue: avg 0 would make this NaN.
    const pct = avg ? Math.round(((today - avg) / avg) * 100) : 0
    const steps = [
      t("steps.pullLedger"),
      t("steps.sumWeek"),
      t("steps.compareAvg"),
    ]
    const reply =
      pct >= 0
        ? t("reply.revenueUp", { today: formatVnd(today), pct })
        : t("reply.revenueDown", { today: formatVnd(today), pct: -pct })
    const findings: Finding[] = [
      {
        kind: "stat",
        icon: Coins,
        label: t("metric.today"),
        value: formatVnd(today),
      },
      {
        kind: "stat",
        icon: TrendingUp,
        label: t("metric.week"),
        value: formatVnd(week),
      },
      {
        kind: "stat",
        icon: TrendingUp,
        label: t("metric.dailyAvg"),
        value: formatVnd(avg),
      },
    ]
    return { steps, reply, findings }
  }

  // ── Promo draft ─────────────────────────────────────────────────────────────
  if (wantsPromo) {
    const idle = freePeakSlots().length
    const steps = [
      t("steps.findSoft"),
      t("steps.priceOffPeak"),
      t("steps.composeMsg"),
    ]
    const reply = t("reply.promo")
    const findings: Finding[] = [
      {
        kind: "note",
        icon: BadgePercent,
        text: t("promo.draft", {
          venue: VENUE.name,
          open: idle || 0,
        }),
      },
    ]
    return {
      steps,
      reply,
      findings,
      action: t("actions.broadcast"),
    }
  }

  // ── Peak hours ──────────────────────────────────────────────────────────────
  if (wantsPeak) {
    const top = PEAK_HOURS[0]
    const steps = [t("steps.aggregateWeek"), t("steps.rankHours")]
    const reply = t("reply.peak", { hour: top.hour, util: top.util })
    const findings: Finding[] = PEAK_HOURS.map((p) => ({
      kind: "stat" as const,
      icon: Flame,
      label: p.hour,
      value: `${p.util}%`,
    }))
    return { steps, reply, findings }
  }

  // ── Default: capabilities overview ──────────────────────────────────────────
  const steps = [t("steps.parse"), t("steps.surveyData")]
  const reply = t("reply.default", { venue: VENUE.name })
  const findings: Finding[] = [
    { kind: "note", icon: Clock, text: t("can.free") },
    { kind: "note", icon: Coins, text: t("can.revenue") },
    { kind: "note", icon: Flame, text: t("can.peak") },
    { kind: "note", icon: BadgePercent, text: t("can.promo") },
  ]
  return { steps, reply, findings }
}

export function VenueCopilot() {
  const t = useTranslations("VenueCopilot")
  const {
    peakHours: PEAK_HOURS,
    revenueSeries: REVENUE_SERIES,
    venue: VENUE,
    courtById,
    venueScheduleFor,
  } = useVenueData()

  const GREETING: Msg = {
    id: "greet",
    role: "assistant",
    type: "text",
    text: t("greeting", { manager: VENUE.manager.name }),
  }

  const SUGGESTIONS = SUGGESTION_KEYS.map((k) => ({
    key: k,
    label: t(`suggestions.${k}`),
  }))

  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<Msg[]>([GREETING])
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const idRef = React.useRef(1)
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const uid = () => `m${idRef.current++}`

  // Clear any pending timers on unmount.
  React.useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  // Keep the thread pinned to the latest message.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  // Focus the input when the panel opens.
  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return

    const plan = runQuery(text, t, {
      PEAK_HOURS,
      REVENUE_SERIES,
      VENUE,
      courtById,
      venueScheduleFor,
    })
    const { steps, reply, findings, action } = plan
    const thinkId = uid()
    const seconds = (((steps.length + 1) * STEP_MS) / 1000).toFixed(1)

    setDraft("")
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", type: "text", text },
      {
        id: thinkId,
        role: "assistant",
        type: "thinking",
        steps,
        revealed: 0,
        done: false,
        seconds,
        collapsed: false,
      },
    ])

    let i = 0
    const tick = () => {
      i += 1
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkId && m.type === "thinking" ? { ...m, revealed: i } : m
        )
      )
      if (i < steps.length) {
        timers.current.push(setTimeout(tick, STEP_MS))
      } else {
        timers.current.push(
          setTimeout(() => {
            setMessages((prev) => [
              ...prev.map((m) =>
                m.id === thinkId && m.type === "thinking"
                  ? { ...m, done: true, collapsed: true }
                  : m
              ),
              {
                id: uid(),
                role: "assistant",
                type: "result",
                reply,
                findings,
                action,
              },
            ])
            setBusy(false)
          }, STEP_MS)
        )
      }
    }
    timers.current.push(setTimeout(tick, STEP_MS))
  }

  const toggleCollapse = (id: string) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.type === "thinking"
          ? { ...m, collapsed: !m.collapsed }
          : m
      )
    )

  const showSuggestions = messages.length === 1 && !busy

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(560px,72vh)] w-[calc(100vw-2.5rem)] max-w-[388px] flex-col overflow-hidden rounded-4xl bg-card shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/60 p-4">
              <span className="grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-sm">
                <Sparkles className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold tracking-tight">
                  {t("title")}
                </p>
                <p className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                  {t("subtitle", { venue: VENUE.name })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label={t("closeAria")}
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </header>

            {/* Thread */}
            <div
              ref={scrollRef}
              className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            >
              {messages.map((m) =>
                m.type === "thinking" ? (
                  <ThinkingBlock
                    key={m.id}
                    msg={m}
                    onToggle={() => toggleCollapse(m.id)}
                  />
                ) : m.type === "result" ? (
                  <ResultBlock key={m.id} msg={m} />
                ) : (
                  <Bubble key={m.id} mine={m.role === "user"} text={m.text} />
                )
              )}

              {showSuggestions ? (
                <div className="mt-1 flex flex-col gap-2">
                  <MicroCaption>{t("tryAsking")}</MicroCaption>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => send(s.label)}
                        className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
              className="flex items-center gap-2 border-t border-border/60 p-3"
            >
              <Input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={busy ? t("thinking") : t("placeholder")}
                className="rounded-full"
                aria-label={t("inputAria")}
                disabled={busy}
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={t("sendAria")}
                disabled={busy || !draft.trim()}
              >
                <Send />
              </Button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Floating bubble */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t("toggleClose") : t("toggleOpen")}
        className="relative grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-lg ring-1 ring-foreground/5 transition-transform hover:scale-105 active:scale-95 dark:ring-foreground/10"
      >
        {!open ? (
          <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/50" />
        ) : null}
        <span className="relative">
          {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
        </span>
      </button>
    </div>
  )
}

function MicroCaption({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-3xl px-4 py-2 text-sm",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {text}
      </div>
    </div>
  )
}

function ThinkingBlock({
  msg,
  onToggle,
}: {
  msg: Extract<Msg, { type: "thinking" }>
  onToggle: () => void
}) {
  const t = useTranslations("VenueCopilot")
  const expanded = !msg.collapsed

  return (
    <div className="rounded-3xl bg-muted/50 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <button
        type="button"
        onClick={onToggle}
        disabled={!msg.done}
        className="flex w-full items-center gap-2 text-left"
      >
        {msg.done ? (
          <Sparkles className="size-3.5 text-brand" />
        ) : (
          <Loader2 className="size-3.5 animate-spin text-brand" />
        )}
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {msg.done ? t("thoughtFor", { seconds: msg.seconds }) : t("thinking")}
        </span>
        {msg.done ? (
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              expanded ? "" : "-rotate-90"
            )}
          />
        ) : null}
      </button>

      {expanded ? (
        <ol className="mt-2.5 flex flex-col gap-1.5">
          {msg.steps.map((step, i) => {
            const done = i < msg.revealed
            const active = i === msg.revealed && !msg.done
            if (!done && !active) return null
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {done ? (
                  <Check className="size-3.5 shrink-0 text-brand" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/70" />
                )}
                <span className={cn(done ? "" : "text-foreground")}>
                  {step}
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

function ResultBlock({ msg }: { msg: Extract<Msg, { type: "result" }> }) {
  const t = useTranslations("VenueCopilot")
  const [applied, setApplied] = React.useState(false)

  return (
    <div className="flex flex-col gap-2">
      <Bubble mine={false} text={msg.reply} />

      {msg.findings.length ? (
        <div className="flex flex-col gap-1 rounded-3xl bg-muted/40 p-1.5 ring-1 ring-foreground/5 dark:ring-foreground/10">
          {msg.findings.map((f, i) => (
            <FindingRow key={i} finding={f} />
          ))}
        </div>
      ) : null}

      {msg.action ? (
        <div className="flex justify-start pl-1">
          {applied ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand">
              <Check className="size-3.5" />
              {t("queued")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setApplied(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
            >
              <Sparkles className="size-3.5" />
              {msg.action}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  const Icon = finding.icon

  if (finding.kind === "stat") {
    return (
      <div className="flex items-center gap-2.5 rounded-3xl p-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {finding.label}
        </span>
        <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
          {finding.value}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-3xl p-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm">{finding.text}</span>
    </div>
  )
}
