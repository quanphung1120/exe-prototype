"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "framer-motion"
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBooking } from "@/components/dashboard/booking"
import { useData } from "@/components/dashboard/data-provider"
import {
  SPORTS,
  formatVnd,
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

type Translator = ReturnType<typeof useTranslations>

const SUGGESTION_KEYS = ["badminton", "cheapest", "pickleball"] as const

/**
 * Fake "AI" planner: light keyword matching on the prompt to pick and order
 * courts, plus reasoning lines that adapt to whatever filter matched. Fully
 * deterministic so it reads the same on every run. All user-facing text is
 * localized via the passed-in translators.
 */
function runQuery(
  prompt: string,
  t: Translator,
  tc: Translator,
  COURTS: Court[]
): {
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

  const rankKey = wantsCheap ? "price" : wantsNear ? "distance" : "rating"
  const rank = t(`rank.${rankKey}`)

  const sportText = matchedSport ? `${tc(`sports.${matchedSport}`)} ` : ""
  const steps = [
    t("steps.location"),
    t("steps.scanning", { count: pool.length, sport: sportText }),
    t("steps.slots"),
    t("steps.ranking", { rank }),
    t("steps.selecting", { count: courts.length }),
  ]

  const reply = courts.length
    ? t("reply.found", { count: courts.length, sport: sportText, rank })
    : t("reply.none")

  return { steps, reply, courts }
}

export function CourtAssistant() {
  const t = useTranslations("Assistant")
  const tc = useTranslations("Common")
  const tPlay = useTranslations("Play")
  const { openPlay, openBooking } = useBooking()
  const { courts: COURTS } = useData()
  const pathname = usePathname()
  const constraintsRef = React.useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const draggedRef = React.useRef(false)
  const [align, setAlign] = React.useState<{
    v: "top" | "bottom"
    h: "left" | "right"
  }>({ v: "bottom", h: "right" })

  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const x = info.point.x
    const y = info.point.y
    const midX = typeof window !== "undefined" ? window.innerWidth / 2 : 0
    const midY = typeof window !== "undefined" ? window.innerHeight / 2 : 0

    setAlign({
      v: y < midY ? "top" : "bottom",
      h: x < midX ? "left" : "right",
    })
  }

  const handleTogglePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    draggedRef.current = false

    if (!open) {
      dragControls.start(event)
    }
  }

  const handleTogglePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    const start = pointerStartRef.current
    if (!start) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.hypot(dx, dy) > 4) {
      draggedRef.current = true
    }
  }

  const handleToggleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (draggedRef.current) {
      event.preventDefault()
      draggedRef.current = false
      return
    }

    setOpen((o) => !o)
  }

  const GREETING: Msg = {
    id: "greet",
    role: "assistant",
    type: "text",
    text: t("greeting"),
  }

  const SUGGESTIONS = SUGGESTION_KEYS.map((k) => t(`suggestions.${k}`))

  const [open, setOpen] = React.useState(false)
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null)
  const [messages, setMessages] = React.useState<Msg[]>([GREETING])
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const idRef = React.useRef(1)
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pathnameRef = React.useRef(pathname)

  const uid = () => `m${idRef.current++}`

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setPortalRoot(document.body))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Clear any pending timers on unmount.
  React.useEffect(() => {
    const currentTimers = timers.current
    return () => currentTimers.forEach(clearTimeout)
  }, [])

  // Keep the thread pinned to the latest message.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  // Focus the input when the panel opens.
  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Close the panel whenever navigation changes the visible page.
  React.useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname
      setOpen(false)
    }
  }, [pathname])

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return

    const { steps, reply, courts } = runQuery(text, t, tc, COURTS)
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

  const handleBook = (courtId: string) => {
    setOpen(false)
    openBooking(courtId)
  }

  const showSuggestions = messages.length === 1 && !busy

  const assistant = (
    <>
      <div
        ref={constraintsRef}
        className="pointer-events-none fixed inset-4 z-[70]"
      />

      <motion.div
        drag
        dragControls={dragControls}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={false}
        dragListener={false}
        onDragEnd={handleDragEnd}
        className="pointer-events-auto fixed right-5 bottom-5 z-[70] flex flex-col items-end gap-3 sm:right-6 sm:bottom-6"
      >
        <AnimatePresence>
          {open ? (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              style={{
                transformOrigin: `${align.v} ${align.h}`,
              }}
              className={cn(
                "absolute z-[70] isolate flex h-[620px] max-h-[calc(100vh-6rem)] w-[600px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-4xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10",
                align.v === "bottom"
                  ? "top-auto bottom-full mb-3"
                  : "top-full bottom-auto mt-3",
                align.h === "right" ? "right-0 left-auto" : "right-auto left-0"
              )}
            >
              {/* Header */}
              <header className="flex items-center gap-3 border-b border-border/60 p-4">
                <span className="grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-sm">
                  <Sparkles className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-base font-bold tracking-tight sm:text-lg">
                    {t("title")}
                  </p>
                  <p className="inline-flex items-center gap-1 text-sm text-muted-foreground sm:text-[15px]">
                    <span className="size-1.5 rounded-full bg-brand" />
                    {t("subtitle")}
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
                    <ResultBlock key={m.id} msg={m} onBook={handleBook} />
                  ) : (
                    <Bubble key={m.id} mine={m.role === "user"} text={m.text} />
                  )
                )}

                {showSuggestions ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        openPlay()
                      }}
                      className="rounded-full bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
                    >
                      {tPlay("button")}
                    </button>
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

        {/* Assistant toggle */}
        <button
          type="button"
          onPointerDown={handleTogglePointerDown}
          onPointerMove={handleTogglePointerMove}
          onClick={handleToggleClick}
          aria-expanded={open}
          aria-label={open ? t("toggleClose") : t("toggleOpen")}
          className="relative grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-lg ring-1 ring-foreground/5 transition-transform hover:scale-105 active:scale-95 dark:ring-foreground/10"
        >
          {!open ? (
            <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/50" />
          ) : null}
          <span className="relative">
            {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
          </span>
        </button>
      </motion.div>
    </>
  )

  return portalRoot ? createPortal(assistant, portalRoot) : null
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
  const t = useTranslations("Assistant")
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

function ResultBlock({
  msg,
  onBook,
}: {
  msg: Extract<Msg, { type: "result" }>
  onBook: (courtId: string) => void
}) {
  const t = useTranslations("Assistant")
  const { courts: COURTS } = useData()
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
            {t("courtsCount", { count: courts.length })}
          </p>
          <CourtCarousel courts={courts} onBook={onBook} />
        </>
      ) : null}
    </div>
  )
}

/**
 * Horizontally sliding list of court cards. The chat panel is too narrow for a
 * full court row, so each result becomes its own snap-scrolling card; a peek of
 * the next card plus the transparent edge arrows signal there's more to scroll.
 */
function CourtCarousel({
  courts,
  onBook,
}: {
  courts: Court[]
  onBook: (courtId: string) => void
}) {
  const t = useTranslations("Assistant")
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

  // Recompute reachability once cards have laid out.
  React.useEffect(() => {
    sync()
  }, [sync, courts])

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }

  const single = courts.length < 2

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={sync}
        className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {courts.map((c) => (
          <CourtCard key={c.id} court={c} solo={single} onBook={onBook} />
        ))}
      </div>

      {/* Edge fades + transparent arrows — only while there's room to scroll. */}
      {!atStart ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 rounded-l-3xl bg-gradient-to-r from-card to-transparent" />
          <CarouselArrow
            dir="left"
            label={t("scrollPrev")}
            onClick={() => nudge(-1)}
          />
        </>
      ) : null}
      {!atEnd ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-3xl bg-gradient-to-l from-card to-transparent" />
          <CarouselArrow
            dir="right"
            label={t("scrollNext")}
            onClick={() => nudge(1)}
          />
        </>
      ) : null}
    </div>
  )
}

/** Mostly-transparent circular scroll control overlaid on a carousel edge. */
function CarouselArrow({
  dir,
  label,
  onClick,
}: {
  dir: "left" | "right"
  label: string
  onClick: () => void
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-card/60 text-foreground/80 shadow-md ring-1 ring-foreground/10 backdrop-blur-sm transition hover:bg-card hover:text-foreground",
        dir === "left" ? "left-1" : "right-1"
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

/** A single court rendered as a self-contained card inside the carousel. */
function CourtCard({
  court,
  solo,
  onBook,
}: {
  court: Court
  solo?: boolean
  onBook: (courtId: string) => void
}) {
  const t = useTranslations("Assistant")
  const tf = useTranslations("CourtFinder")
  const ts = useTranslations("Shared")

  const scoreWord =
    court.rating >= 4.7
      ? "exceptional"
      : court.rating >= 4.5
        ? "excellent"
        : "veryGood"

  return (
    <div
      className={cn(
        "flex shrink-0 snap-start flex-col gap-3 rounded-3xl bg-muted/50 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10",
        solo ? "w-full" : "w-[15rem]"
      )}
    >
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5 dark:ring-foreground/10" />

      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{court.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">
              {court.district} · {court.distanceKm} km
            </span>
          </p>
          <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground shadow-sm ring-1 ring-foreground/5">
            <Star className="size-3 shrink-0 fill-lime text-lime" />
            <span className="text-sm leading-none font-bold text-secondary-foreground tabular-nums">
              {court.rating}
            </span>
            <span className="text-[10px] leading-none font-medium text-muted-foreground">
              {tf(`score.${scoreWord}`)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-end gap-2">
        <span className="font-heading text-lg leading-none font-bold tabular-nums">
          {formatVnd(court.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">
            {ts("perHour")}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => onBook(court.id)}
        >
          {t("book")}
        </Button>
      </div>
    </div>
  )
}
