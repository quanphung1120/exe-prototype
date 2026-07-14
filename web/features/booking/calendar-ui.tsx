"use client"

// Shared calendar UI primitives — the chrome every dashboard calendar reuses so
// the Bookings, Venue Schedule and Book-wizard calendars stay visually and
// behaviourally identical: a Day/Week/Month switcher, a prev/Today/next toolbar,
// a vertical day/week Timeline, and a Month grid. Each surface keeps its OWN
// data + event/gap rendering and feeds it in — these only own the layout.

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  dayOfMonth,
  isToday,
  isWeekend,
  monthMatrix,
  sameMonth,
  type CalendarView,
} from "@/features/booking/calendar"

// Timeline geometry: one hour is HOUR_PX tall; everything derives from it. Every
// timeline spans the full 24h day (00:00 at the top) so placement is uniform —
// a block's top is just `minutes-from-midnight * PX_PER_MIN`.
export const HOUR_PX = 56
export const PX_PER_MIN = HOUR_PX / 60
export const DAY_MIN = 24 * 60
const FULL_DAY_HOURS = Array.from({ length: 24 }, (_, i) => i)

/** Minutes since midnight from a "HH:MM" string. */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** The current local wall-clock time as "HH:MM". */
function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`
}

/**
 * The live local time as "HH:MM", or null until mounted on the client. The rest
 * of the app renders off a fixed `venue.now` so SSR and hydration agree; a real
 * clock would mismatch, so this stays null on the server and first client render
 * and fills in right after mount, then ticks every 30s. Feed it to the calendar
 * now-line/live pill in place of the seed's fixed time.
 */
export function useNow(): string | null {
  const [now, setNow] = React.useState<string | null>(null)
  React.useEffect(() => {
    const update = () => setNow(nowHHMM())
    const first = setTimeout(update, 0)
    const interval = setInterval(update, 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [])
  return now
}

const VIEW_ICON: Record<
  CalendarView,
  React.ComponentType<{ className?: string }>
> = {
  day: CalendarDays,
  week: CalendarRange,
  month: LayoutGrid,
}

/** Segmented Day · Week · Month control (full-width on mobile). */
export function ViewSwitcher({
  view,
  onView,
}: {
  view: CalendarView
  onView: (v: CalendarView) => void
}) {
  const t = useTranslations("Calendar")
  const views: CalendarView[] = ["day", "week", "month"]
  return (
    <div className="inline-flex w-full rounded-full bg-muted/60 p-1 sm:w-auto">
      {views.map((v) => {
        const Icon = VIEW_ICON[v]
        const active = v === view
        return (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={active}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:flex-none",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {t(`views.${v}`)}
          </button>
        )
      })}
    </div>
  )
}

/** Header strip: prev/Today/next nav + period label + optional live pill + switcher. */
export function CalendarToolbar({
  periodLabel,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  live,
}: {
  periodLabel: string
  view: CalendarView
  onView: (v: CalendarView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  /** Pre-formatted "Now · 18:00"-style text, or null when today isn't in view. */
  live?: string | null
}) {
  const t = useTranslations("Calendar")
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={onPrev}
            aria-label={t("prev")}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3"
            onClick={onToday}
          >
            {t("today")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={onNext}
            aria-label={t("next")}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-heading text-base font-semibold tabular-nums sm:text-lg">
            {periodLabel}
          </h2>
          {live ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {live}
            </span>
          ) : null}
        </div>
      </div>

      <ViewSwitcher view={view} onView={onView} />
    </div>
  )
}

/** One column of the {@link Timeline}: a header plus absolutely-placed content. */
export interface TimelineColumn {
  key: string
  header: React.ReactNode
  today?: boolean
  weekend?: boolean
  /** Absolutely-positioned blocks (events, gaps, shading) placed via PX_PER_MIN. */
  content: React.ReactNode
}

/**
 * A Google-Calendar-style vertical timeline: a sticky hour gutter + one column
 * per item. A single column (Day) fills the width; several columns (Week, or
 * courts) scroll horizontally on narrow screens with a sticky gutter. The now
 * line is drawn on every column flagged `today`.
 */
export function Timeline({
  columns,
  now,
  single,
  scrollKey,
  emptyLabel,
  minColPx = 104,
}: {
  columns: TimelineColumn[]
  /** Current "HH:MM"; the now line/pill show only when a column is `today`. */
  now?: string | null
  single?: boolean
  /** Re-scrolls the timeline to "now" (or evening) whenever this changes. */
  scrollKey?: string
  emptyLabel?: string | null
  minColPx?: number
}) {
  const showsNow = Boolean(now) && columns.some((c) => c.today)
  const nowTop = now ? toMin(now) * PX_PER_MIN : 0

  // Open scrolled so "now" (or the evening peak) sits a third from the top.
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const focus = showsNow && now ? toMin(now) : toMin("17:00")
    el.scrollTop = Math.max(0, focus * PX_PER_MIN - el.clientHeight / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, single, showsNow])

  return (
    <div
      ref={scrollRef}
      className="relative no-scrollbar max-h-[60vh] overflow-auto rounded-3xl ring-1 ring-border/60 lg:max-h-[640px]"
    >
      <div
        style={{
          minWidth: single ? undefined : columns.length * minColPx + 48,
        }}
      >
        {/* Sticky column header — solid (not blurred): a backdrop-filter here
            ignores the scroll container's rounded-corner clip in Chromium and
            paints a square corner over it. */}
        <div className="sticky top-0 z-30 flex bg-card">
          <div className="sticky left-0 z-40 w-12 shrink-0 border-b border-border/60 bg-card" />
          <div className="flex flex-1">
            {columns.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "min-w-0 flex-1 border-b border-l border-border/60 px-2 py-2",
                  c.weekend && "bg-muted/20"
                )}
              >
                {c.header}
              </div>
            ))}
          </div>
        </div>

        {/* Body: time gutter + columns */}
        <div className="flex">
          <div
            className="sticky left-0 z-20 w-12 shrink-0 bg-card"
            style={{ height: DAY_MIN * PX_PER_MIN }}
          >
            {FULL_DAY_HOURS.map((h, i) => (
              <span
                key={h}
                className="absolute right-1.5 font-mono text-[10px] text-muted-foreground tabular-nums"
                style={{ top: i * HOUR_PX + 12 }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {showsNow ? (
              <span
                className="absolute right-1 -translate-y-1/2 rounded bg-brand px-1 py-0.5 text-[9px] font-bold text-brand-foreground tabular-nums"
                style={{ top: nowTop }}
              >
                {now}
              </span>
            ) : null}
          </div>

          <div className="flex flex-1">
            {columns.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "relative min-w-0 flex-1 border-l border-border/50",
                  c.weekend && "bg-muted/15"
                )}
                style={{ height: DAY_MIN * PX_PER_MIN }}
              >
                {/* Hour + half-hour gridlines */}
                {FULL_DAY_HOURS.map((h, i) => (
                  <React.Fragment key={h}>
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                      style={{ top: i * HOUR_PX }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/20"
                      style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                    />
                  </React.Fragment>
                ))}

                {c.content}

                {c.today && showsNow ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-brand"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -top-1 -left-0.5 size-2 rounded-full bg-brand" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {emptyLabel ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-40 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A 6×7 Mon-first month grid. Each cell shows its day number (today highlighted)
 * plus caller-rendered content (event chips / dots / occupancy); tapping a day
 * calls `onPickDay` (surfaces drill into that day's timeline).
 */
export function MonthGrid({
  cursor,
  todayIso,
  renderDay,
  onPickDay,
  emptyLabel,
  hasContent = true,
}: {
  cursor: string
  todayIso: string
  renderDay: (iso: string, inMonth: boolean) => React.ReactNode
  onPickDay: (iso: string) => void
  emptyLabel?: string | null
  hasContent?: boolean
}) {
  const t = useTranslations("Calendar")
  const weekdaysShort = t.raw("weekdaysShort") as string[]
  const weeks = monthMatrix(cursor)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        {weekdaysShort.map((d, i) => (
          <span
            key={d}
            className={cn(
              "px-1 py-1 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase",
              i >= 5 && "text-muted-foreground/70"
            )}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((iso) => {
          const inMonth = sameMonth(iso, cursor)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay(iso)}
              className={cn(
                "flex min-h-[68px] flex-col gap-1 rounded-xl border border-border/50 p-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:min-h-[104px] sm:p-2",
                isWeekend(iso) && "bg-muted/20",
                !inMonth && "opacity-40"
              )}
            >
              <span
                className={cn(
                  "ml-auto inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  isToday(iso, todayIso)
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground"
                )}
              >
                {dayOfMonth(iso)}
              </span>
              {renderDay(iso, inMonth)}
            </button>
          )
        })}
      </div>

      {!hasContent && emptyLabel ? (
        <p className="pt-2 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : null}
    </div>
  )
}
