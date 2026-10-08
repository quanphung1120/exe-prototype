"use client"

import * as React from "react"
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  LayoutGrid,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Trophy,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

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
  hasOpenCancelRequest,
  locStr,
  sportAccent,
  sportLabel,
  type Booking,
  type BookingStatus,
} from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import {
  addDays,
  addMonths,
  dayOfMonth,
  isPastDay,
  isToday,
  isWeekend,
  mondayIndex,
  monthMatrix,
  monthOf,
  sameMonth,
  weekDays,
  yearOf,
  type CalendarView,
} from "@/features/booking/calendar"
import {
  MonthGrid,
  PX_PER_MIN,
  Timeline,
  toMin,
  useNow,
  type TimelineColumn,
} from "@/features/booking/calendar-ui"
import { useBooking } from "@/features/booking/booking"
import { openVenueChat } from "@/features/chat/stream-actions"
import { SportTag } from "@/features/dashboard/shared"
import { NewBookingAction } from "@/features/dashboard/section-actions"
import { useRouter } from "@/i18n/navigation"

const DAY_MIN = 24 * 60

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

const isAwaitingPayment = (booking: Booking) =>
  booking.paymentStatus === "awaiting"

function usePaymentCountdown(
  expiresAt: string | undefined,
  active: boolean
): number | null {
  const [remaining, setRemaining] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!active || !expiresAt) return
    const update = () => {
      const seconds = Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000)
      setRemaining(Math.max(0, seconds))
    }
    const first = setTimeout(update, 0)
    const interval = setInterval(update, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [active, expiresAt])

  return remaining
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

/** Tint + ring per booking status, used for the calendar event blocks. */
const bookingAccent: Record<BookingStatus, string> = {
  confirmed: "bg-[#2046ed] text-white ring-[#2046ed]",
  pending: "bg-[#fff4d6] text-[#8a5a00] ring-[#f5c451]",
  completed: "bg-[#eef1f6] text-[#596783] ring-[#dfe4ee]",
  cancelled: "bg-[#fdecec] text-[#b42318]/80 ring-[#f6c9c9]",
}

/** "Sân 3" for a seeded "Court 3", else the stored court name as-is. */
function useCourtLabel() {
  const t = useTranslations("Bookings")
  return (court: string) => {
    const n = court.match(/^Court (\d+)$/)?.[1]
    return n ? t("courtLabel", { n }) : court
  }
}

/** Blue date tile (month · big lime day · optional caption) used across the page. */
function DateTile({
  iso,
  caption,
  size = "md",
  className,
}: {
  iso: string | undefined
  caption?: string
  size?: "sm" | "md"
  className?: string
}) {
  const locale = useLocale()
  const date = iso ? new Date(`${iso}T00:00:00`) : null
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-[#2046ed] text-center text-white",
        size === "sm" ? "size-14" : "w-[72px] py-2.5",
        className
      )}
    >
      <span className="text-[10px] leading-none font-semibold tracking-wide uppercase opacity-80">
        {date
          ? new Intl.DateTimeFormat(locale, { month: "short" }).format(date)
          : ""}
      </span>
      <span
        className={cn(
          "font-heading leading-none font-black text-[#a5ff12] tabular-nums",
          size === "sm" ? "text-xl" : "mt-0.5 text-3xl"
        )}
      >
        {date ? date.getDate() : "—"}
      </span>
      {caption ? (
        <span className="mt-1 font-mono text-[10px] leading-none tabular-nums opacity-80">
          {caption}
        </span>
      ) : null}
    </div>
  )
}

/** The soonest upcoming game, front and centre — tap to jump the calendar to it. */
function NextUpCard({
  booking,
  onView,
}: {
  booking: Booking | null
  onView: (iso: string) => void
}) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const courtLabel = useCourtLabel()

  return (
    <section className="relative isolate order-1 shrink-0 overflow-hidden rounded-3xl bg-[#2046ed] p-5 text-white shadow-[0_10px_30px_#2046ed33] lg:order-none">
      {/* Shuttle-court motif */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 -z-10 size-40 rounded-full border-[18px] border-[#a5ff12]/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 -bottom-16 -z-10 size-28 rounded-full bg-white/5"
      />

      <p className="text-[11px] font-bold tracking-[0.14em] text-[#a5ff12] uppercase">
        {t("nextUp.title")}
      </p>

      {booking ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <DateTile
              iso={booking.dayKey}
              className="bg-white/12 ring-1 ring-white/20"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-heading text-lg leading-snug font-black">
                {booking.venue}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
                <Clock className="size-3.5 shrink-0" />
                <span className="font-mono tabular-nums">{booking.time}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{courtLabel(booking.court)}</span>
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
              {isAwaitingPayment(booking)
                ? t("unpaid")
                : tc(`status.${booking.status}`)}
            </span>
            {booking.dayKey ? (
              <button
                type="button"
                onClick={() => onView(booking.dayKey as string)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#a5ff12] px-4 text-xs font-bold text-[#173bc8] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a5ff12]"
              >
                <CalendarDays className="size-4" />
                {t("nextUp.view")}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-white/85">
          {t("nextUp.empty")}
        </p>
      )}
    </section>
  )
}

/** Compact stat tile in the left rail. */
function StatTile({
  label,
  value,
  brand = false,
}: {
  label: string
  value: number
  brand?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl px-3.5 py-3",
        brand ? "bg-[#a5ff12] text-[#173bc8]" : "bg-[#f4f7fc]"
      )}
    >
      <span
        className={cn(
          "text-[11px] font-semibold",
          brand ? "text-[#173bc8]/80" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span className="font-heading text-2xl leading-none font-black tabular-nums">
        {value}
      </span>
    </div>
  )
}

const VIEWS: { key: CalendarView; icon: typeof CalendarDays }[] = [
  { key: "day", icon: CalendarDays },
  { key: "week", icon: CalendarRange },
  { key: "month", icon: LayoutGrid },
]

/**
 * Player-styled calendar toolbar — lime-ringed round nav (as on the Book
 * wizard's day picker) and a pill Day/Week/Month switch (as on Play's tabs).
 */
function BookingsToolbar({
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
  live: string | null
}) {
  const t = useTranslations("Calendar")
  const navBtn =
    "grid size-9 shrink-0 place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label={t("prev")}
          className={navBtn}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-9 shrink-0 rounded-full border-2 border-lime px-4 text-sm font-semibold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("today")}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={t("next")}
          className={navBtn}
        >
          <ChevronRight className="size-5" />
        </button>
        <div className="ml-1.5 flex min-w-0 flex-col">
          <h2 className="truncate font-heading text-lg leading-tight font-black tabular-nums">
            {periodLabel}
          </h2>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {live}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-full bg-[#f4f7fc] p-1 md:inline-grid">
        {VIEWS.map(({ key, icon: Icon }) => {
          const active = key === view
          return (
            <button
              key={key}
              type="button"
              onClick={() => onView(key)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t(`views.${key}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Start ("HH:MM") of a stored "HH:MM – HH:MM" time range. */
const startOf = (time: string) => time.split(" – ")[0] ?? time

/** A visible day of the Day/Week timeline. */
interface Col {
  iso: string
  /** The date itself, or null when in the past — gates the tap-to-book gaps. */
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
  const { todayIso } = useData()
  const now = useNow()
  const router = useRouter()

  // Pull the freshest seed on entry so an operator's approve/decline made
  // elsewhere in this session (same account, venue workspace) reconciles into
  // the player's bookings — see SessionProvider's reconcile-from-seed effect.
  React.useEffect(() => {
    router.refresh()
  }, [router])

  const [view, setView] = React.useState<CalendarView>("week")
  const [cursor, setCursor] = React.useState<string>(todayIso)

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
        dayKey: isPastDay(iso, todayIso) ? null : iso,
        short: wd,
        num,
        full: `${wd}, ${num} ${monthsShort[monthOf(iso)]}`,
        today: isToday(iso, todayIso),
        weekend: isWeekend(iso),
      }
    },
    [weekdaysShort, monthsShort, todayIso]
  )

  // Every booking that resolves to a real date, bucketed by ISO day — the grid
  // (Day / Week / Month) reads from this; sorted by start time within a day.
  const eventsByDate = React.useMemo(() => {
    const map: Record<string, Booking[]> = {}
    for (const b of bookings) {
      const iso = b.dayKey
      if (iso) (map[iso] ||= []).push(b)
    }
    for (const iso of Object.keys(map))
      map[iso].sort((a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time)))
    return map
  }, [bookings])

  // History list below the grid: bookings dated before today.
  const past = React.useMemo(
    () => bookings.filter((b) => (b.dayKey ?? "") < todayIso),
    [bookings, todayIso]
  )
  const inWeekStats = React.useMemo(
    () => bookings.filter((b) => (b.dayKey ?? "") >= todayIso),
    [bookings, todayIso]
  )

  // The soonest live booking (today onward) — featured in the "Up next" card.
  const nextUp = React.useMemo(
    () =>
      bookings
        .filter(
          (b) => (b.dayKey ?? "") >= todayIso && UPCOMING.includes(b.status)
        )
        .sort(
          (a, b) =>
            (a.dayKey ?? "").localeCompare(b.dayKey ?? "") ||
            toMin(startOf(a.time)) - toMin(startOf(b.time))
        )[0] ?? null,
    [bookings, todayIso]
  )

  const stats = {
    week: inWeekStats.filter(
      (b) => UPCOMING.includes(b.status) && !isAwaitingPayment(b)
    ).length,
    confirmed: inWeekStats.filter((b) => b.status === "confirmed").length,
    pending: inWeekStats.filter(
      (b) => b.status === "pending" && !isAwaitingPayment(b)
    ).length,
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
      ? sameMonth(cursor, todayIso)
      : view === "week"
        ? weekDays(cursor).includes(todayIso)
        : isToday(cursor, todayIso)

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
    // Same frame as Play / Book: full-width up to 1800px, and on desktop the
    // page fits the viewport — a left rail (next game, stats, history) beside
    // the calendar, each scrolling on its own.
    <div className="player-bookings flex min-h-full flex-col bg-[#f6f9ff] text-[#0b1224] lg:h-full lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:min-h-0 lg:px-7">
        {/* Page header */}
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
              {t("metaTitle")}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("metaDescription")}
            </p>
          </div>
          <NewBookingAction />
        </header>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left rail. `contents` on mobile lets its cards interleave with
              the calendar (next game → stats → calendar → history). */}
          <aside className="no-scrollbar contents lg:flex lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-y-auto">
            <NextUpCard booking={nextUp} onView={openDay} />

            <section className="order-2 shrink-0 rounded-3xl border border-[#eaf0fc] bg-white p-3 shadow-[0_3px_16px_#14205006] lg:order-none">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                <StatTile label={t("summary.thisWeek")} value={stats.week} />
                <StatTile
                  label={t("summary.confirmed")}
                  value={stats.confirmed}
                  brand
                />
                <StatTile label={t("summary.pending")} value={stats.pending} />
                <StatTile label={t("summary.played")} value={stats.played} />
              </div>
            </section>

            {/* Past games */}
            <section className="order-4 flex shrink-0 flex-col gap-2 rounded-3xl border border-[#eaf0fc] bg-white p-3 shadow-[0_3px_16px_#14205006] lg:order-none">
              <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                <h2 className="font-heading text-base font-black">
                  {t("past.title")}
                </h2>
                {past.length ? (
                  <span className="rounded-full bg-[#f4f7fc] px-2 py-0.5 text-[11px] font-bold text-brand tabular-nums">
                    {past.length}
                  </span>
                ) : null}
              </div>
              {past.length ? (
                <div className="flex flex-col gap-2">
                  {past.map((b) => (
                    <PastRow key={b.id} booking={b} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-[#e3eafa] bg-[#f6f9ff] px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                  {t("empty")}
                </p>
              )}
            </section>
          </aside>

          {/* The calendar */}
          <section className="order-3 flex min-w-0 flex-col gap-4 rounded-3xl border border-[#eaf0fc] bg-white p-3.5 shadow-[0_3px_16px_#14205006] sm:p-5 lg:order-none lg:min-h-0 lg:overflow-y-auto">
            <BookingsToolbar
              periodLabel={periodLabel}
              view={view}
              onView={setView}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToday={() => setCursor(todayIso)}
              live={
                showsToday && now ? t("calendar.liveAt", { time: now }) : null
              }
            />

            {view === "month" ? (
              <MonthGrid
                cursor={cursor}
                todayIso={todayIso}
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
                className="ring-[#eaf0fc] lg:max-h-none lg:min-h-0 lg:flex-1"
              />
            )}

            {/* Legend (timeline views) */}
            {view !== "month" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#eaf0fc] pt-3">
                <LegendDot status="confirmed" />
                <LegendDot status="pending" />
                <LegendDot status="completed" />
                <LegendDot status="cancelled" />
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-0 w-4 border-t-2 border-brand" />
                  {t("calendar.now")}
                </span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
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
/** "HH:MM dd/mm" of a +07:00 ISO datetime (string slicing — no timezone math). */
function shortVnDateTime(iso: string): string {
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

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
  const {
    cancelBooking,
    withdrawCancel,
    rebookFrom,
    addTeamToSession,
    resumePayment,
    resumingPaymentId,
  } = useBooking()
  const router = useRouter()
  const [opening, startOpening] = React.useTransition()

  const messageVenue = () => {
    startOpening(async () => {
      try {
        const { id } = await openVenueChat({ venueId: booking.venueId })
        router.push(`/app/chat?channel=${id}`)
      } catch {
        toast.error(t("messageVenueFailed"))
      }
    })
  }

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
  const courtNo = booking.court.match(/^Court (\d+)$/)?.[1]
  const courtLabel = courtNo ? t("courtLabel", { n: courtNo }) : booking.court
  const paymentRemaining = usePaymentCountdown(
    booking.paymentExpiresAt,
    isAwaitingPayment(booking)
  )
  // Cancelling a paid booking is a request the venue answers
  // (docs/chinh-sach.md §2.4); an unpaid hold still cancels outright.
  const request = booking.cancelRequest
  const requestOpen = hasOpenCancelRequest(booking)
  const requestDeclined = Boolean(request?.declinedAt) && !cancelled
  const paid = booking.paymentStatus === "paid"

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
        <PopoverContent
          align="start"
          className="player-bookings-overlay w-72 p-3"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {booking.venue}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courtLabel} ·{" "}
                  {tc.has(`sports.${booking.sport}`)
                    ? tc(`sports.${booking.sport}`)
                    : sportLabel(booking.sport)}
                </p>
              </div>
              <StatusBadge
                status={booking.status}
                paymentStatus={booking.paymentStatus}
              />
            </div>

            <div className="flex items-center gap-2">
              <SportTag sport={booking.sport} />
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

            {isAwaitingPayment(booking) ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {paymentRemaining === 0
                  ? t("paymentExpiredNote")
                  : paymentRemaining != null
                    ? t("paymentCountdown", {
                        time: formatCountdown(paymentRemaining),
                      })
                    : t("paymentPendingNote")}
              </p>
            ) : booking.status === "pending" ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {t("pendingNote")}
              </p>
            ) : null}

            {requestOpen && request ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {t("cancelPendingNote", {
                  deadline: shortVnDateTime(request.deadlineAt),
                  pct: request.defaultPct,
                })}
              </p>
            ) : requestDeclined ? (
              <p className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                {t("cancelDeclinedNote", {
                  reason: request?.declineReason ?? "",
                })}
              </p>
            ) : cancelled && request?.resolvedAt ? (
              <p className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                {request.auto
                  ? t("cancelAutoNote", { pct: request.refundPct ?? 0 })
                  : t("cancelApprovedNote", { pct: request.refundPct ?? 0 })}
              </p>
            ) : null}

            {cancelled && booking.declineReason ? (
              <div className="flex flex-col gap-1 rounded-2xl bg-destructive/8 px-3 py-2 text-xs text-destructive/80">
                <span>
                  {t("declinedNote", { reason: booking.declineReason })}
                </span>
                {booking.refunded ? (
                  <span className="text-muted-foreground">
                    {t("refundedNote")}
                  </span>
                ) : null}
              </div>
            ) : null}

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
              <div className="flex flex-col gap-1.5">
                {booking.venueId && !cancelled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start rounded-full"
                    disabled={opening}
                    onClick={messageVenue}
                  >
                    <MessageSquare />
                    {t("messageVenue")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start rounded-full"
                  onClick={() => rebookFrom(booking.id)}
                >
                  <RotateCcw />
                  {t("rebook")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {isAwaitingPayment(booking) ? (
                  <Button
                    size="sm"
                    className="w-full justify-start rounded-full"
                    disabled={
                      resumingPaymentId ===
                      (booking.reservationId ?? booking.id)
                    }
                    onClick={() =>
                      resumePayment(booking.reservationId ?? booking.id)
                    }
                  >
                    {resumingPaymentId ===
                    (booking.reservationId ?? booking.id) ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <CreditCard />
                    )}
                    {resumingPaymentId === (booking.reservationId ?? booking.id)
                      ? t("openingPayment")
                      : t("continuePayment")}
                  </Button>
                ) : null}
                {booking.venueId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start rounded-full"
                    disabled={opening}
                    onClick={messageVenue}
                  >
                    <MessageSquare />
                    {t("messageVenue")}
                  </Button>
                ) : null}
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
                {requestOpen ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start rounded-full text-destructive"
                    onClick={() => withdrawCancel(booking.id)}
                  >
                    <Undo2 />
                    {t("withdrawCancel")}
                  </Button>
                ) : requestDeclined ? null : (
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
                      {paid ? t("requestCancel") : t("cancel")}
                    </AlertDialogTrigger>
                    <AlertDialogContent className="player-bookings-overlay">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {paid ? t("requestCancelTitle") : t("cancelTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {paid
                            ? t("requestCancelBody")
                            : hasTeam
                              ? t("cancelTeamBody")
                              : t("cancelSoloBody")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => cancelBooking(booking.id)}
                        >
                          {paid
                            ? t("requestCancelConfirm")
                            : t("cancelConfirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
      className="group/free absolute inset-x-1 z-0 flex items-center justify-center rounded-lg text-[#173bc8]/0 transition-colors hover:bg-[#a5ff12]/25 hover:text-[#173bc8] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
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

/**
 * One past game in the left rail's history list: date tile, venue, court and
 * time, the result/score (or final status), the players and a rebook action.
 */
function PastRow({ booking }: { booking: Booking }) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const { rebookFrom } = useBooking()
  const { dayLabelFor } = useData()
  const locale = useLocale()
  const courtLabel = useCourtLabel()
  const done = booking.status === "completed"

  const whenKey = WHEN_KEY[booking.day]
  const dayLabel = booking.dayKey
    ? locStr(dayLabelFor(booking.dayKey), locale)
    : whenKey
      ? tc(`when.${whenKey}`)
      : t(`records.${booking.id}.day`)

  return (
    // Two stacked bands so nothing has to share one tight line in the 320px
    // rail: identity (date · venue · court · time) above, and a wrapping meta
    // strip (sport · result/status · players) + rebook below.
    <div className="flex flex-col gap-2.5 rounded-2xl border border-[#eaf0fc] bg-white p-2.5 transition-colors hover:border-[#d6e0f7] hover:bg-[#f6f9ff]">
      <div className="flex items-start gap-3">
        <DateTile iso={booking.dayKey} size="sm" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="line-clamp-2 text-sm leading-snug font-bold">
            {booking.venue}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{courtLabel(booking.court)}</span>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span className="truncate tabular-nums">
              {dayLabel} · {booking.time}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-dashed border-[#e3eafa] pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <SportTag sport={booking.sport} />
          {done && booking.result ? (
            <>
              <Badge
                className={cn(
                  booking.result === "W"
                    ? "bg-[#a5ff12] text-[#173bc8]"
                    : "bg-[#eef1f6] text-[#596783]"
                )}
              >
                <Trophy className="size-3" />
                {booking.result === "W" ? tc("result.win") : tc("result.loss")}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {booking.score}
              </span>
            </>
          ) : (
            <StatusBadge status={booking.status} />
          )}
          {booking.withPlayers.length ? (
            <AvatarGroup>
              {booking.withPlayers.slice(0, 3).map((p) => (
                <Avatar key={p.initials} size="sm">
                  <AvatarFallback className="bg-[#f4f7fc] text-[10px] font-semibold text-[#173bc8]">
                    {p.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => rebookFrom(booking.id)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border-2 border-lime px-3 text-[11px] font-bold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCcw className="size-3.5" />
          {t("rebook")}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  paymentStatus,
}: {
  status: BookingStatus
  paymentStatus?: Booking["paymentStatus"]
}) {
  const tc = useTranslations("Common")
  const t = useTranslations("Bookings")
  if (paymentStatus === "awaiting")
    return <Badge className="bg-[#fff4d6] text-[#8a5a00]">{t("unpaid")}</Badge>
  const label = tc(`status.${status}`)
  if (status === "confirmed")
    return <Badge className="bg-[#2046ed] text-white">{label}</Badge>
  if (status === "pending")
    return <Badge className="bg-[#fff4d6] text-[#8a5a00]">{label}</Badge>
  if (status === "cancelled")
    return <Badge className="bg-[#fdecec] text-[#b42318]">{label}</Badge>
  return <Badge className="bg-[#eef1f6] text-[#596783]">{label}</Badge>
}
