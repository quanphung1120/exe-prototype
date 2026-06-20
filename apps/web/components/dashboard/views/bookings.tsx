"use client"

import * as React from "react"
import {
  CalendarRange,
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  VENUE_DAYS,
  addMinutes,
  durationOf,
  locStr,
  sportAccent,
  type Booking,
  type BookingStatus,
} from "@/components/dashboard/data"
import { useBooking } from "@/components/dashboard/booking"
import { useData } from "@/components/dashboard/data-provider"
import { SportTag } from "@/components/dashboard/shared"

// Calendar geometry: one hour is HOUR_PX tall; everything else derives from it.
const HOUR_PX = 56
const PX_PER_MIN = HOUR_PX / 60

// The calendar spans the full day: hour labels 00:00–23:00 over a 24h grid.
const FULL_DAY_HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_MIN = 24 * 60
// Top breathing room so the 00:00 label isn't clipped by the grid's top edge.
const GRID_PAD = 12

/** The booking-week columns (Today → Mon), labelled per-locale. */
const DAY_KEYS = VENUE_DAYS.map((d) => d.key)

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

/** Tint + ring per booking status, used for the calendar event blocks. */
const bookingAccent: Record<BookingStatus, string> = {
  confirmed: "bg-brand/15 text-brand ring-brand/25",
  pending: "bg-chart-3/15 text-chart-3 ring-chart-3/30",
  completed: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-destructive/10 text-destructive/70 ring-destructive/20",
}

/** Minutes since midnight from a "HH:MM" string. */
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** Start ("HH:MM") of a stored "HH:MM – HH:MM" time range. */
const startOf = (time: string) => time.split(" – ")[0] ?? time

export function BookingsView() {
  const t = useTranslations("Bookings")
  const locale = useLocale()
  const { bookings } = useBooking()
  const { venue } = useData()

  // Split into this week's bookings (placed on the grid by their day key) and
  // history (completed/cancelled games with no day in the booking window).
  const inWeek = bookings.filter((b) => b.dayKey && DAY_KEYS.includes(b.dayKey))
  const past = bookings.filter((b) => !(b.dayKey && DAY_KEYS.includes(b.dayKey)))

  const eventsByDay = React.useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of inWeek) (map[b.dayKey as string] ||= []).push(b)
    for (const key of Object.keys(map))
      map[key].sort((a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time)))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings])

  // The calendar shows the full 24-hour day, so every hour is visible
  // regardless of when the week's games fall.
  const hours = FULL_DAY_HOURS
  const totalMin = DAY_MIN
  /** Minutes from midnight (the grid's top) to a "HH:MM" time. */
  const offsetMin = (hhmm: string) => toMin(hhmm)
  const nowTop = offsetMin(venue.now) * PX_PER_MIN

  // The full-day grid is taller than its scroll box, so open it with the live
  // "now" line a third from the top rather than scrolled to midnight.
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = Math.max(0, GRID_PAD + nowTop - el.clientHeight / 3)
  }, [nowTop])

  const stats = {
    week: inWeek.filter((b) => UPCOMING.includes(b.status)).length,
    confirmed: inWeek.filter((b) => b.status === "confirmed").length,
    pending: inWeek.filter((b) => b.status === "pending").length,
    played: past.length,
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryChip label={t("summary.thisWeek")} value={`${stats.week}`} />
        <SummaryChip
          label={t("summary.confirmed")}
          value={`${stats.confirmed}`}
          tone="brand"
        />
        <SummaryChip label={t("summary.pending")} value={`${stats.pending}`} />
        <SummaryChip label={t("summary.played")} value={`${stats.played}`} />
      </div>

      {/* The week calendar */}
      <section className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <header className="flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
            <CalendarRange className="size-4 text-muted-foreground" />
            {t("calendar.title")}
          </h2>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <span className="relative flex size-2">
              <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {t("calendar.liveAt", { time: venue.now })}
          </span>
        </header>

        <div
          ref={scrollRef}
          className="relative max-h-[640px] overflow-auto rounded-3xl ring-1 ring-border/60"
        >
          <div className="min-w-[680px]">
            {/* Sticky day header */}
            <div className="sticky top-0 z-30 flex bg-card/95 backdrop-blur">
              <div className="sticky left-0 z-40 w-12 shrink-0 border-b border-border/60 bg-card/95" />
              <div className="flex flex-1">
                {VENUE_DAYS.map((d) => {
                  const count = (eventsByDay[d.key] ?? []).length
                  return (
                    <div
                      key={d.key}
                      className="min-w-[120px] flex-1 border-b border-l border-border/60 px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            "truncate text-sm font-semibold",
                            d.key === "today" && "text-brand"
                          )}
                        >
                          {locStr(d.label, locale)}
                        </span>
                        {count ? (
                          <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                            {count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Body: time gutter + day columns */}
            <div className="flex" style={{ paddingTop: GRID_PAD }}>
              {/* Time gutter */}
              <div
                className="sticky left-0 z-20 w-12 shrink-0 bg-card"
                style={{ height: totalMin * PX_PER_MIN }}
              >
                {hours.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: i * HOUR_PX }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
                <span
                  className="absolute right-1 -translate-y-1/2 rounded bg-brand px-1 py-0.5 text-[9px] font-bold text-brand-foreground tabular-nums"
                  style={{ top: nowTop }}
                >
                  {venue.now}
                </span>
              </div>

              {/* Day columns */}
              <div className="flex flex-1">
                {VENUE_DAYS.map((d) => {
                  const isToday = d.key === "today"
                  const dayEvents = eventsByDay[d.key] ?? []
                  const gaps = gapsOf(dayEvents, 0, totalMin)
                  return (
                    <div
                      key={d.key}
                      className="relative min-w-[120px] flex-1 border-l border-border/50"
                      style={{ height: totalMin * PX_PER_MIN }}
                    >
                      {/* Hour + half-hour gridlines */}
                      {hours.map((h, i) => (
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

                      {/* Clickable free gaps → start a new booking on this day */}
                      {gaps.map((g) => (
                        <FreeBand
                          key={`${d.key}-${g.start}`}
                          dayKey={d.key}
                          dayLabel={locStr(d.label, locale)}
                          start={g.start}
                          durationMin={g.durationMin}
                          offsetMin={offsetMin}
                        />
                      ))}

                      {/* Bookings */}
                      {dayEvents.map((b) => (
                        <CalendarEvent
                          key={b.id}
                          booking={b}
                          dayLabel={locStr(d.label, locale)}
                          offsetMin={offsetMin}
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

          {!inWeek.length ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-6 z-40 text-center text-sm text-muted-foreground">
              {t("calendar.empty")}
            </p>
          ) : null}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
          <LegendDot status="confirmed" />
          <LegendDot status="pending" />
          <LegendDot status="cancelled" />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-0 w-4 border-t-2 border-brand" />
            {t("calendar.now")}
          </span>
        </div>
      </section>

      {/* Past games */}
      {past.length ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold">
            {t("past.title")}
          </h2>
          {past.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Free gaps (the complement of the day's events) within the visible window. */
function gapsOf(
  events: Booking[],
  windowStart: number,
  totalMin: number
): { start: string; durationMin: number }[] {
  const sorted = [...events].sort(
    (a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time))
  )
  const bands: { start: string; durationMin: number }[] = []
  let cursor = 0
  for (const e of sorted) {
    const s = toMin(startOf(e.time)) - windowStart
    if (s > cursor)
      bands.push({
        start: addMinutes("00:00", windowStart + cursor),
        durationMin: s - cursor,
      })
    cursor = Math.max(cursor, s + durationOf(e.time))
  }
  if (cursor < totalMin)
    bands.push({
      start: addMinutes("00:00", windowStart + cursor),
      durationMin: totalMin - cursor,
    })
  return bands
}

/** Day words that resolve to a shared `Common.when` key (past-list labels). */
const WHEN_KEY: Record<string, string> = {
  Today: "today",
  Tomorrow: "tomorrow",
  Yesterday: "yesterday",
}

/** A booking drawn as a Google-Calendar block, sized to its real duration. */
function CalendarEvent({
  booking,
  dayLabel,
  offsetMin,
}: {
  booking: Booking
  dayLabel: string
  offsetMin: (hhmm: string) => number
}) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const { cancelBooking, rebookFrom, addTeamToSession } = useBooking()

  const start = startOf(booking.time)
  const dur = durationOf(booking.time)
  const top = offsetMin(start) * PX_PER_MIN
  const height = Math.max(20, dur * PX_PER_MIN - 2)
  const compact = height < 46
  const cancelled = booking.status === "cancelled"
  const closed = booking.status === "completed" || cancelled
  const hasTeam = Boolean(booking.roomId)
  const solo = booking.withPlayers.length <= 1
  const going = booking.withPlayers.filter((p) => p.status !== "pending").length
  const invited = booking.withPlayers.filter(
    (p) => p.status === "pending"
  ).length
  const courtNo = booking.court.match(/\d+/)?.[0]
  const courtLabel = courtNo ? t("courtLabel", { n: courtNo }) : booking.court

  return (
    <div className="absolute inset-x-1 z-10" style={{ top: top + 1, height }}>
      <Popover>
        <PopoverTrigger
          nativeButton
          className={cn(
            "flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-left ring-1 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            bookingAccent[booking.status],
            cancelled && "line-through"
          )}
        >
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                sportAccent(booking.sport)
              )}
              aria-hidden
            />
            <span className="truncate text-[11px] leading-tight font-semibold">
              {booking.venue}
            </span>
          </span>
          {!compact ? (
            <>
              <span className="font-mono text-[10px] leading-none tabular-nums opacity-80">
                {start} – {addMinutes(start, dur)}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] leading-none opacity-80">
                <Users className="size-2.5" />
                {courtLabel}
              </span>
            </>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {booking.venue}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courtLabel} · {tc(`sports.${booking.sport}`)}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            <div className="flex items-center gap-2">
              <SportTag sport={booking.sport} />
              <span className="text-xs text-muted-foreground">
                · {tc(`format.${booking.format.toLowerCase()}`)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span className="font-mono tabular-nums">
                  {dayLabel} · {start} – {addMinutes(start, dur)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" />
                {booking.venue}
              </span>
            </div>

            {booking.withPlayers.length ? (
              <div className="flex items-center justify-between gap-2">
                <AvatarGroup>
                  {booking.withPlayers.map((p) => (
                    <Avatar key={p.initials}>
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {p.initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </AvatarGroup>
                {invited > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("goingInvited", { going, invited })}
                  </span>
                ) : null}
              </div>
            ) : null}

            {booking.status === "completed" && booking.result ? (
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    booking.result === "W"
                      ? "bg-brand/12 text-brand"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Trophy className="size-3" />
                  {booking.result === "W" ? tc("result.win") : tc("result.loss")}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {booking.score}
                </span>
              </div>
            ) : null}

            {/* Actions */}
            {closed ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start rounded-full"
                onClick={() => rebookFrom(booking.id)}
              >
                <RotateCcw />
                {t("rebook")}
              </Button>
            ) : (
              <div className="flex flex-col gap-1.5">
                {solo ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start rounded-full"
                    onClick={() => addTeamToSession(booking.id)}
                  >
                    <UserPlus />
                    {t("addTeam")}
                  </Button>
                ) : null}
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start rounded-full text-destructive"
                      />
                    }
                  >
                    {t("cancel")}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {hasTeam ? t("cancelTeamBody") : t("cancelSoloBody")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => cancelBooking(booking.id)}
                      >
                        {t("cancelConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** A free gap — subtle until hovered, click to start a booking on that day. */
function FreeBand({
  dayKey,
  dayLabel,
  start,
  durationMin,
  offsetMin,
}: {
  dayKey: string
  dayLabel: string
  start: string
  durationMin: number
  offsetMin: (hhmm: string) => number
}) {
  const t = useTranslations("Bookings")
  const { openBooking, setDay, setSlot } = useBooking()
  const top = offsetMin(start) * PX_PER_MIN
  const height = durationMin * PX_PER_MIN
  if (height < 24) return null

  const startBooking = () => {
    openBooking(null)
    setDay(dayKey)
    setSlot(start)
  }

  return (
    <button
      type="button"
      onClick={startBooking}
      title={t("calendar.bookDay", { day: dayLabel })}
      className="group/free absolute inset-x-1 z-0 flex items-center justify-center rounded-lg text-muted-foreground/0 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      style={{ top, height }}
    >
      <Plus className="size-3.5" />
    </button>
  )
}

/** Compact legend entry mapping a status to its calendar tint. */
function LegendDot({ status }: { status: BookingStatus }) {
  const tc = useTranslations("Common")
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-3 rounded-md ring-1",
          bookingAccent[status]
        )}
      />
      {tc(`status.${status}`)}
    </span>
  )
}

/** Inline summary stat chip for the header strip. */
function SummaryChip({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "brand"
}) {
  return (
    <div className="flex flex-col gap-2 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-heading text-3xl leading-none font-bold tracking-tight tabular-nums",
          tone === "brand" && "text-brand"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Past-game card (history list below the calendar). Carries the result/score
 * and a rebook action — the calendar grid only holds this booking week.
 */
function BookingCard({ booking }: { booking: Booking }) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const { rebookFrom } = useBooking()
  const done = booking.status === "completed"

  const tb = useTranslations("Booking")
  const whenKey = WHEN_KEY[booking.day]
  const dayLabel = booking.dayKey
    ? tb(`days.${booking.dayKey}`)
    : whenKey
      ? tc(`when.${whenKey}`)
      : t(`records.${booking.id}.day`)
  const courtNo = booking.court.match(/\d+/)?.[0]
  const courtLabel = courtNo ? t("courtLabel", { n: courtNo }) : booking.court

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:flex-row sm:items-center dark:ring-foreground/10">
      {/* Date block */}
      <div className="grid w-16 shrink-0 place-items-center rounded-3xl bg-secondary py-3 text-center text-secondary-foreground">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {dayLabel.split(",")[0].slice(0, 3)}
        </span>
        <span className="font-heading text-xl leading-none font-bold tabular-nums">
          {booking.time.split(":")[0]}
          <span className="text-xs">
            :{booking.time.split(":")[1].slice(0, 2)}
          </span>
        </span>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SportTag sport={booking.sport} />
          <span className="text-xs text-muted-foreground">
            · {tc(`format.${booking.format.toLowerCase()}`)}
          </span>
        </div>
        <p className="mt-0.5 font-heading text-lg font-semibold">
          {booking.venue}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {courtLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {dayLabel} · {booking.time}
          </span>
        </div>
      </div>

      {/* Players + result */}
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        <AvatarGroup>
          {booking.withPlayers.map((p) => (
            <Avatar key={p.initials}>
              <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                {p.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>

        {done && booking.result ? (
          <div className="flex items-center gap-2">
            <Badge
              className={cn(
                booking.result === "W"
                  ? "bg-brand/12 text-brand"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Trophy className="size-3" />
              {booking.result === "W" ? tc("result.win") : tc("result.loss")}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {booking.score}
            </span>
          </div>
        ) : (
          <StatusBadge status={booking.status} />
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 sm:ml-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full rounded-full sm:w-auto"
          onClick={() => rebookFrom(booking.id)}
        >
          {t("rebook")}
        </Button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const tc = useTranslations("Common")
  const label = tc(`status.${status}`)
  if (status === "confirmed")
    return <Badge className="bg-brand/12 text-brand">{label}</Badge>
  if (status === "pending") return <Badge variant="secondary">{label}</Badge>
  if (status === "cancelled")
    return <Badge variant="destructive">{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}
