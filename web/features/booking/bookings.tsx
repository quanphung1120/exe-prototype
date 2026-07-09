"use client"

import * as React from "react"
import {
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react"
import { useTranslations } from "next-intl"

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
  addMinutes,
  durationOf,
  sportAccent,
  type Booking,
  type BookingStatus,
} from "@/features/dashboard/data"
import {
  addDays,
  addMonths,
  dateForDayKey,
  dayKeyForDate,
  dayOfMonth,
  isToday,
  isWeekend,
  mondayIndex,
  monthMatrix,
  monthOf,
  parseLabelDate,
  sameMonth,
  TODAY_ISO,
  weekDays,
  yearOf,
  type CalendarView,
} from "@/features/booking/calendar"
import {
  CalendarToolbar,
  MonthGrid,
  PX_PER_MIN,
  Timeline,
  toMin,
  useNow,
  type TimelineColumn,
} from "@/features/booking/calendar-ui"
import { useBooking } from "@/features/booking/booking"
import { SportTag } from "@/features/dashboard/shared"

const DAY_MIN = 24 * 60

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

/** Tint + ring per booking status, used for the calendar event blocks. */
const bookingAccent: Record<BookingStatus, string> = {
  confirmed: "bg-brand/15 text-brand ring-brand/25",
  pending: "bg-chart-3/15 text-chart-3 ring-chart-3/30",
  completed: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-destructive/10 text-destructive/70 ring-destructive/20",
}

/** Start ("HH:MM") of a stored "HH:MM – HH:MM" time range. */
const startOf = (time: string) => time.split(" – ")[0] ?? time

/** Resolve a booking to a real calendar date (bookable key, else its label). */
const bookingDateISO = (b: Booking): string | null =>
  dateForDayKey(b.dayKey) ?? parseLabelDate(b.day)

/** A visible day of the Day/Week timeline. */
interface Col {
  iso: string
  /** Bookable day key (today/tomorrow/…) or null — gates the tap-to-book gaps. */
  dayKey: string | null
  short: string
  num: number
  /** "Mon, 22 Jun" — used as the booking title and popover day label. */
  full: string
  today: boolean
  weekend: boolean
}

export function BookingsView() {
  const t = useTranslations("Bookings")
  const tcal = useTranslations("Calendar")
  const { bookings } = useBooking()
  const now = useNow()

  const [view, setView] = React.useState<CalendarView>("week")
  const [cursor, setCursor] = React.useState<string>(TODAY_ISO)

  const weekdaysShort = tcal.raw("weekdaysShort") as string[]
  const monthsShort = tcal.raw("monthsShort") as string[]
  const months = tcal.raw("months") as string[]

  /** Build a column descriptor for a date. */
  const makeCol = React.useCallback(
    (iso: string): Col => {
      const wd = weekdaysShort[mondayIndex(iso)]
      const num = dayOfMonth(iso)
      return {
        iso,
        dayKey: dayKeyForDate(iso),
        short: wd,
        num,
        full: `${wd}, ${num} ${monthsShort[monthOf(iso)]}`,
        today: isToday(iso),
        weekend: isWeekend(iso),
      }
    },
    [weekdaysShort, monthsShort]
  )

  // Every booking that resolves to a real date, bucketed by ISO day — the grid
  // (Day / Week / Month) reads from this; sorted by start time within a day.
  const eventsByDate = React.useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of bookings) {
      const iso = bookingDateISO(b)
      if (iso) (map[iso] ||= []).push(b)
    }
    for (const iso of Object.keys(map))
      map[iso].sort((a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time)))
    return map
  }, [bookings])

  // History list below the grid: bookings with no place in the bookable window.
  const past = React.useMemo(
    () => bookings.filter((b) => !dateForDayKey(b.dayKey)),
    [bookings]
  )
  const inWeekStats = React.useMemo(
    () => bookings.filter((b) => dateForDayKey(b.dayKey)),
    [bookings]
  )

  const stats = {
    week: inWeekStats.filter((b) => UPCOMING.includes(b.status)).length,
    confirmed: inWeekStats.filter((b) => b.status === "confirmed").length,
    pending: inWeekStats.filter((b) => b.status === "pending").length,
    played: past.length,
  }

  // Visible columns + period heading derive from the view + cursor.
  const cols = React.useMemo<Col[]>(() => {
    if (view === "day") return [makeCol(cursor)]
    if (view === "week") return weekDays(cursor).map(makeCol)
    return []
  }, [view, cursor, makeCol])

  const periodLabel = React.useMemo(() => {
    if (view === "month") return `${months[monthOf(cursor)]} ${yearOf(cursor)}`
    if (view === "day") return makeCol(cursor).full
    const days = weekDays(cursor)
    const a = days[0]
    const b = days[6]
    const aM = monthsShort[monthOf(a)]
    const bM = monthsShort[monthOf(b)]
    return sameMonth(a, b)
      ? `${dayOfMonth(a)}–${dayOfMonth(b)} ${aM}`
      : `${dayOfMonth(a)} ${aM} – ${dayOfMonth(b)} ${bM}`
  }, [view, cursor, makeCol, months, monthsShort])

  const showsToday =
    view === "month"
      ? sameMonth(cursor, TODAY_ISO)
      : view === "week"
        ? weekDays(cursor).includes(TODAY_ISO)
        : isToday(cursor)

  const step = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "day"
        ? addDays(c, dir)
        : view === "week"
          ? addDays(c, dir * 7)
          : addMonths(c, dir)
    )

  const openDay = (iso: string) => {
    setCursor(iso)
    setView("day")
  }

  // Build the timeline columns (header + placed events/gaps) for Day/Week.
  const timelineColumns = React.useMemo<TimelineColumn[]>(
    () =>
      cols.map((c) => {
        const dayEvents = eventsByDate[c.iso] ?? []
        const gaps = gapsOf(dayEvents, 0, DAY_MIN)
        return {
          key: c.iso,
          today: c.today,
          weekend: c.weekend,
          header: (
            <div className="flex items-center justify-between gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 truncate text-sm font-semibold",
                  c.today && "text-brand"
                )}
              >
                <span className="text-muted-foreground">{c.short}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    c.today &&
                      "grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
                  )}
                >
                  {c.num}
                </span>
              </span>
              {dayEvents.length ? (
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                  {dayEvents.length}
                </span>
              ) : null}
            </div>
          ),
          content: (
            <>
              {c.dayKey
                ? gaps.map((g) => (
                    <FreeBand
                      key={`${c.iso}-${g.start}`}
                      dayKey={c.dayKey as string}
                      dayLabel={c.full}
                      start={g.start}
                      durationMin={g.durationMin}
                      offsetMin={toMin}
                    />
                  ))
                : null}
              {dayEvents.map((b) => (
                <CalendarEvent
                  key={b.id}
                  booking={b}
                  dayLabel={c.full}
                  offsetMin={toMin}
                />
              ))}
            </>
          ),
        }
      }),
    [cols, eventsByDate]
  )

  const anyVisible = timelineColumns.some(
    (c) => (eventsByDate[c.key] ?? []).length
  )
  const monthHasEvents = monthMatrix(cursor)
    .flat()
    .some((iso) => sameMonth(iso, cursor) && eventsByDate[iso]?.length)

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

      {/* The calendar */}
      <section className="flex flex-col gap-4 rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5 dark:ring-foreground/10">
        <CalendarToolbar
          periodLabel={periodLabel}
          view={view}
          onView={setView}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setCursor(TODAY_ISO)}
          live={showsToday && now ? t("calendar.liveAt", { time: now }) : null}
        />

        {view === "month" ? (
          <MonthGrid
            cursor={cursor}
            onPickDay={openDay}
            hasContent={monthHasEvents}
            emptyLabel={t("calendar.emptyMonth")}
            renderDay={(iso) => (
              <MonthDay events={eventsByDate[iso] ?? []} tcal={tcal} />
            )}
          />
        ) : (
          <Timeline
            columns={timelineColumns}
            now={now}
            single={view === "day"}
            scrollKey={`${view}:${cursor}`}
            emptyLabel={anyVisible ? null : t("calendar.empty")}
          />
        )}

        {/* Legend (timeline views) */}
        {view !== "month" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
            <LegendDot status="confirmed" />
            <LegendDot status="pending" />
            <LegendDot status="cancelled" />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-0 w-4 border-t-2 border-brand" />
              {t("calendar.now")}
            </span>
          </div>
        ) : null}
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

/** Month-cell content: up to two booking chips (sm+) / sport dots (mobile). */
function MonthDay({
  events,
  tcal,
}: {
  events: Booking[]
  tcal: ReturnType<typeof useTranslations>
}) {
  const shown = events.slice(0, 2)
  const extra = events.length - shown.length
  return (
    <>
      <div className="hidden flex-col gap-1 sm:flex">
        {shown.map((b) => (
          <span
            key={b.id}
            className={cn(
              "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1",
              bookingAccent[b.status],
              b.status === "cancelled" && "line-through"
            )}
          >
            <span className="font-mono tabular-nums opacity-80">
              {startOf(b.time)}
            </span>
            <span className="truncate">{b.venue}</span>
          </span>
        ))}
        {extra > 0 ? (
          <span className="px-1 text-[10px] font-medium text-muted-foreground">
            {tcal("more", { count: extra })}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-1 sm:hidden">
        {events.slice(0, 4).map((b) => (
          <span
            key={b.id}
            className={cn("size-1.5 rounded-full", sportAccent(b.sport))}
            aria-hidden
          />
        ))}
      </div>
    </>
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
                  {booking.result === "W"
                    ? tc("result.win")
                    : tc("result.loss")}
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
      <span className={cn("size-3 rounded-md ring-1", bookingAccent[status])} />
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
