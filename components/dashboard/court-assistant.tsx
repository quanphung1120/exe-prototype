"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowDown,
  Check,
  ChevronDown,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CourtRow, RowAction } from "@/components/dashboard/shared"
import {
  COURTS,
  SPORTS,
  sportLabel,
  type Court,
  type SportKey,
} from "@/components/dashboard/data"

// Delay between each fake "chain of thought" step revealing.
const STEP_MS = 600

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
      text: string
      courtIds: string[]
    }

const GREETING: Msg = {
  id: "greet",
  role: "assistant",
  type: "text",
  text: "Hi — I'm your court assistant. Tell me a sport, a budget, or how close you want to play, and I'll pull up courts near you.",
}

const SUGGESTIONS = [
  "Padel courts near me tonight",
  "Cheapest courts",
  "Tennis this evening",
]

/**
 * Fake "AI" planner: light keyword matching on the prompt to pick and order
 * courts, plus reasoning lines that adapt to whatever filter matched. Fully
 * deterministic so it reads the same on every run.
 */
function runQuery(prompt: string): {
  steps: string[]
  reply: string
  courts: Court[]
} {
  const q = prompt.toLowerCase()

  const matchedSport = SPORTS.find(
    (s) => q.includes(s.key) || q.includes(s.label.toLowerCase())
  )?.key as SportKey | undefined

  const wantsCheap = /cheap|budget|afford|rẻ|giá/.test(q)
  const wantsNear = /near|close|nearby|closest|gần/.test(q)

  let pool = COURTS.filter(
    (c) => !matchedSport || c.sports.includes(matchedSport)
  )
  if (!pool.length) pool = COURTS

  const sorted = [...pool].sort((a, b) => {
    if (wantsCheap) return a.pricePerHour - b.pricePerHour
    if (wantsNear) return a.distanceKm - b.distanceKm
    return b.rating - a.rating
  })

  const courts = sorted.slice(0, 3)

  const rank = wantsCheap
    ? "price (low to high)"
    : wantsNear
      ? "distance from you"
      : "rating and availability"

  const sportText = matchedSport ? `${sportLabel(matchedSport)} ` : ""
  const steps = [
    "Reading your location (Hà Nội)",
    `Scanning ${pool.length} ${sportText}venues nearby`,
    "Checking open slots for today",
    `Ranking by ${rank}`,
    `Selecting your top ${courts.length} matches`,
  ]

  const reply = courts.length
    ? `Found ${courts.length} ${sportText}court${courts.length > 1 ? "s" : ""} for you, ranked by ${rank}.`
    : "I couldn't find a match — try another sport or filter."

  return { steps, reply, courts }
}

export function CourtAssistant() {
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
    return () => timers.current.forEach(clearTimeout)
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

    const { steps, reply, courts } = runQuery(text)
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
                text: reply,
                courtIds: courts.map((c) => c.id),
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
            className="flex h-[min(560px,72vh)] w-[calc(100vw-2.5rem)] max-w-[384px] flex-col overflow-hidden rounded-4xl bg-card shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/60 p-4">
              <span className="grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-sm">
                <Sparkles className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold tracking-tight">
                  Court Assistant
                </p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-brand" />
                  AI · finds courts near you
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Close assistant"
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
                <div className="mt-1 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
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
                placeholder={busy ? "Thinking…" : "Ask for a court…"}
                className="rounded-full"
                aria-label="Ask the court assistant"
                disabled={busy}
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label="Send"
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
        aria-label={open ? "Close court assistant" : "Open court assistant"}
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
          {msg.done ? `Thought for ${msg.seconds}s` : "Thinking…"}
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
                <span className={cn(done ? "" : "text-foreground")}>{step}</span>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

function ResultBlock({ msg }: { msg: Extract<Msg, { type: "result" }> }) {
  const courts = msg.courtIds
    .map((id) => COURTS.find((c) => c.id === id))
    .filter((c): c is Court => Boolean(c))

  return (
    <div className="flex flex-col gap-2">
      <Bubble mine={false} text={msg.text} />
      {courts.length ? (
        <>
          <p className="inline-flex items-center gap-1 pl-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            <ArrowDown className="size-3" />
            {courts.length} courts
          </p>
          <div className="flex flex-col gap-1 rounded-3xl bg-muted/40 p-1.5 ring-1 ring-foreground/5 dark:ring-foreground/10">
            {courts.map((c) => (
              <CourtRow
                key={c.id}
                court={c}
                action={<RowAction>Book</RowAction>}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
