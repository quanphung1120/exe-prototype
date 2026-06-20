"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Ban,
  CalendarClock,
  CalendarRange,
  Footprints,
  Lock,
  MessageSquare,
  Plus,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  VENUE,
  VENUE_COURTS,
  VENUE_DAYS,
  locStr,
  slotKindAccent,
  venueEventsFor,
  venueScheduleFor,
  type ScheduleEvent,
  type SlotKind,
} from "@/components/dashboard/venue/data"
import {
  addMinutes,
  diffMinutes,
  sportAccent,
} from "@/components/dashboard/data"
import {
  MicroLabel,
  Meter,
  VenuePanel,
} from "@/components/dashboard/venue/shared"
import { useVenue } from "@/components/dashboard/venue/venue-provider"

// Calendar geometry: one hour is HOUR_PX tall; everything else derives from it.
const HOUR_PX = 56
const PX_PER_MIN = HOUR_PX / 60
const OPEN_H = Number(VENUE.openFrom.slice(0, 2))
const CLOSE_H = Number(VENUE.openTo.slice(0, 2))
const TOTAL_MIN = diffMinutes(VENUE.openFrom, VENUE.openTo)
const HOURS = Array.from({ length: CLOSE_H - OPEN_H + 1 }, (_, i) => OPEN_H + i)

/** Minutes from opening to a "HH:MM" time. */
const offsetMin = (hhmm: string) => diffMinutes(VENUE.openFrom, hhmm)

const LEGEND_KINDS: Exclude<SlotKind, "free">[] = [
  "booked",
  "walk-in",
  "blocked",
]
const LEGEND_ICON: Record<
  Exclude<SlotKind, "free">,
  React.ComponentType<{ className?: string }>
> = {
  booked: Users,
  "walk-in": Footprints,
  blocked: Wrench,
}

/** Free gaps (complement of the events) within the open window. */
function gapsOf(
  events: ScheduleEvent[]
): { start: string; durationMin: number }[] {
  const sorted = [...events].sort(
    (a, b) => offsetMin(a.start) - offsetMin(b.start)
  )
  const bands: { start: string; durationMin: number }[] = []
  let cursor = 0
  for (const e of sorted) {
    const s = offsetMin(e.start)
    if (s > cursor)
      bands.push({
        start: addMinutes(VENUE.openFrom, cursor),
        durationMin: s - cursor,
      })
    cursor = Math.max(cursor, s + e.durationMin)
  }
  if (cursor < TOTAL_MIN)
    bands.push({
      start: addMinutes(VENUE.openFrom, cursor),
      durationMin: TOTAL_MIN - cursor,
    })
  return bands
}

export function VenueScheduleView() {
  const t = useTranslations("VenueSchedule")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const { stats } = useVenue()

  const [dayKey, setDayKey] = React.useState<string>("today")
  const isToday = dayKey === "today"

  const events = React.useMemo(() => venueEventsFor(dayKey), [dayKey])

  // Day summary derives from the hour grid (itself derived from the events).
  const summary = React.useMemo(() => {
    const grid = venueScheduleFor(dayKey)
    let bookable = 0
    let filled = 0
    let free = 0
    for (const row of grid) {
      for (const slot of row) {
        if (slot.kind === "blocked") continue
        bookable++
        if (slot.kind === "free") free++
        else filled++
      }
    }
    return {
      bookable,
      free,
      filled,
      occupancy: bookable ? Math.round((filled / bookable) * 100) : 0,
    }
  }, [dayKey])

  const activeDay = VENUE_DAYS.find((d) => d.key === dayKey) ?? VENUE_DAYS[0]
  const nowTop = offsetMin(VENUE.now) * PX_PER_MIN

  return (
    <div className="flex flex-col gap-5">
      {/* Heading + day selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { day: locStr(activeDay.label, locale) })}
          </p>
        </div>
        <Tabs value={dayKey} onValueChange={setDayKey}>
          <TabsList variant="line" className="flex-wrap">
            {VENUE_DAYS.map((d) => (
              <TabsTrigger key={d.key} value={d.key}>
                {locStr(d.label, locale)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryChip
          label={t("summary.occupancy")}
          value={`${summary.occupancy}`}
          unit="%"
        >
          <Meter pct={summary.occupancy} className="mt-1" />
        </SummaryChip>
        <SummaryChip
          label={t("summary.booked")}
          value={`${summary.filled}`}
          hint={t("summary.ofSlots", { count: summary.bookable })}
        />
        <SummaryChip
          label={t("summary.free")}
          value={`${summary.free}`}
          hint={t("summary.openToSell")}
          tone="brand"
        />
        <SummaryChip
          label={t("summary.dayUtil")}
          value={`${stats.utilization}`}
          unit="%"
          hint={t("summary.trailing7")}
        />
      </div>

      {/* The calendar */}
      <VenuePanel
        title={t("grid.title")}
        icon={CalendarRange}
        action={
          isToday ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {t("grid.liveAt", { time: VENUE.now })}
            </span>
          ) : null
        }
      >
        <div className="max-h-[660px] overflow-auto rounded-3xl ring-1 ring-border/60">
          <div className="min-w-[680px]">
            {/* Sticky court header */}
            <div className="sticky top-0 z-30 flex bg-card/95 backdrop-blur">
              <div className="sticky left-0 z-40 w-12 shrink-0 border-b border-border/60 bg-card/95" />
              <div className="flex flex-1">
                {VENUE_COURTS.map((court) => (
                  <div
                    key={court.id}
                    className="min-w-[120px] flex-1 border-b border-l border-border/60 px-2 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          sportAccent(court.sport)
                        )}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold">
                        {court.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Meter pct={court.utilToday} className="h-1" />
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {court.utilToday}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body: time gutter + court columns */}
            <div className="flex">
              {/* Time gutter */}
              <div
                className="sticky left-0 z-20 w-12 shrink-0 bg-card"
                style={{ height: TOTAL_MIN * PX_PER_MIN }}
              >
                {HOURS.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: i * HOUR_PX }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
                {isToday ? (
                  <span
                    className="absolute right-1 -translate-y-1/2 rounded bg-brand px-1 py-0.5 text-[9px] font-bold text-brand-foreground tabular-nums"
                    style={{ top: nowTop }}
                  >
                    {VENUE.now}
                  </span>
                ) : null}
              </div>

              {/* Court columns */}
              <div className="flex flex-1">
                {VENUE_COURTS.map((court, idx) => {
                  const colEvents = events[idx] ?? []
                  const gaps =
                    court.state === "maintenance" ? [] : gapsOf(colEvents)
                  return (
                    <div
                      key={court.id}
                      className="relative min-w-[120px] flex-1 border-l border-border/50"
                      style={{ height: TOTAL_MIN * PX_PER_MIN }}
                    >
                      {/* Hour + half-hour gridlines */}
                      {HOURS.map((h, i) => (
                        <React.Fragment key={h}>
                          <div
                            className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                            style={{ top: i * HOUR_PX }}
                          />
                          {i < HOURS.length - 1 ? (
                            <div
                              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/20"
                              style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                            />
                          ) : null}
                        </React.Fragment>
                      ))}

                      {/* Clickable free gaps */}
                      {gaps.map((g) => (
                        <FreeBand
                          key={`${court.id}-${g.start}`}
                          courtName={court.name}
                          start={g.start}
                          durationMin={g.durationMin}
                          t={t}
                        />
                      ))}

                      {/* Events */}
                      {colEvents.map((ev) => (
                        <EventBlock
                          key={ev.id}
                          event={ev}
                          courtName={court.name}
                          t={t}
                          tc={tc}
                        />
                      ))}

                      {/* Now line */}
                      {isToday ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-brand"
                          style={{ top: nowTop }}
                        >
                          <span className="absolute -top-1 -left-0.5 size-2 rounded-full bg-brand" />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
          <MicroLabel className="mr-1">{t("legend.title")}</MicroLabel>
          {LEGEND_KINDS.map((kind) => {
            const Icon = LEGEND_ICON[kind]
            return (
              <span
                key={kind}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-md ring-1",
                    slotKindAccent[kind]
                  )}
                >
                  <Icon className="size-2.5" />
                </span>
                {t(`legend.${kind}`)}
              </span>
            )
          })}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-0 w-4 border-t-2 border-brand" />
            {t("grid.now")}
          </span>
        </div>
      </VenuePanel>
    </div>
  )
}

/** A booked / walk-in / maintenance block, sized to its real duration. */
function EventBlock({
  event,
  courtName,
  t,
  tc,
}: {
  event: ScheduleEvent
  courtName: string
  t: ReturnType<typeof useTranslations>
  tc: ReturnType<typeof useTranslations>
}) {
  const top = offsetMin(event.start) * PX_PER_MIN
  const height = Math.max(18, event.durationMin * PX_PER_MIN - 2)
  const end = addMinutes(event.start, event.durationMin)
  const compact = height < 46
  const blocked = event.kind === "blocked"
  const Icon = event.kind === "walk-in" ? Footprints : Users

  return (
    <div className="absolute inset-x-1 z-10" style={{ top: top + 1, height }}>
      <Popover>
        <PopoverTrigger
          nativeButton
          className={cn(
            "flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-left ring-1 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            slotKindAccent[event.kind],
            event.past && "opacity-45"
          )}
        >
          {blocked ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
              <Lock className="size-3 shrink-0" />
              {t("event.maintenance")}
            </span>
          ) : (
            <>
              <span className="truncate text-[11px] leading-tight font-semibold">
                {event.customer}
              </span>
              {!compact ? (
                <>
                  <span className="font-mono text-[10px] leading-none tabular-nums opacity-80">
                    {event.start} – {end}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] leading-none opacity-80">
                    <Icon className="size-2.5" />
                    {event.party}
                  </span>
                </>
              ) : null}
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {blocked ? t("event.maintenance") : event.customer}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courtName} · {tc(`sports.${event.sport}`)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                  slotKindAccent[event.kind]
                )}
              >
                {t(`legend.${event.kind}`)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">
                {event.start} – {end}
              </span>
              {!blocked ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon className="size-3.5" />
                  {event.party}
                </span>
              ) : null}
            </div>

            {blocked ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start rounded-full"
                onClick={() =>
                  toast.success(t("toast.reopened"), { description: courtName })
                }
              >
                <Wrench />
                {t("event.reopen")}
              </Button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Button
                  size="sm"
                  className="w-full justify-start rounded-full"
                  onClick={() =>
                    toast.success(t("toast.messaged"), {
                      description: event.customer,
                    })
                  }
                >
                  <MessageSquare />
                  {t("event.message")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start rounded-full"
                  onClick={() =>
                    toast(t("toast.rescheduled"), {
                      description: `${event.start} – ${end}`,
                    })
                  }
                >
                  <CalendarClock />
                  {t("event.reschedule")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start rounded-full text-destructive"
                  onClick={() =>
                    toast(t("toast.cancelledEvent"), {
                      description: event.customer,
                    })
                  }
                >
                  <Ban />
                  {t("event.cancel")}
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** A free gap — subtle until hovered, click to add a walk-in or block it. */
function FreeBand({
  courtName,
  start,
  durationMin,
  t,
}: {
  courtName: string
  start: string
  durationMin: number
  t: ReturnType<typeof useTranslations>
}) {
  const top = offsetMin(start) * PX_PER_MIN
  const height = durationMin * PX_PER_MIN
  if (height < 16) return null
  const slotLabel = t("popover.slot", { court: courtName, hour: start })

  return (
    <div className="absolute inset-x-1 z-0" style={{ top, height }}>
      <Popover>
        <PopoverTrigger
          nativeButton
          className="group/free flex h-full w-full items-center justify-center rounded-lg text-muted-foreground/0 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Plus className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3">
          <div className="flex flex-col gap-3">
            <div>
              <MicroLabel>{t("popover.title")}</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{slotLabel}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                className="w-full justify-start rounded-full"
                onClick={() =>
                  toast.success(t("toast.walkInTitle"), {
                    description: slotLabel,
                  })
                }
              >
                <Plus />
                {t("popover.addWalkIn")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start rounded-full"
                onClick={() =>
                  toast(t("toast.blockTitle"), { description: slotLabel })
                }
              >
                <Wrench />
                {t("popover.blockCourt")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start rounded-full text-muted-foreground"
                onClick={() =>
                  toast(t("toast.suggestTitle"), { description: slotLabel })
                }
              >
                <Sparkles />
                {t("popover.suggestFill")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Inline summary stat chip for the day header strip. */
function SummaryChip({
  label,
  value,
  unit,
  hint,
  tone = "default",
  children,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: "default" | "brand"
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <MicroLabel>{label}</MicroLabel>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-heading text-3xl leading-none font-bold tracking-tight tabular-nums",
            tone === "brand" && "text-brand"
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}
