"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Ban,
  CalendarClock,
  CalendarRange,
  Footprints,
  Lock,
  Phone,
  Plus,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  slotKindAccent,
  type Reservation,
  type ScheduleEvent,
  type SlotKind,
  type VenueCourt,
} from "@/features/venue/data"
import { addMinutes, sportAccent } from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import {
  addDays,
  addMonths,
  dayOfMonth,
  isToday,
  isWeekend,
  mondayIndex,
  monthOf,
  sameMonth,
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
import { useVenueData } from "@/features/venue/venue-data-provider"
import {
  MicroLabel,
  Meter,
  ReasonDialog,
  VenuePanel,
} from "@/features/venue/shared"
import { useVenue } from "@/features/venue/venue-provider"
import {
  addWalkInReservation,
  cancelReservation,
  rescheduleReservation,
} from "@/features/venue/venue-actions"

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

export function VenueScheduleView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const locale = useLocale()
  const t = useTranslations("VenueSchedule")
  const tc = useTranslations("Common")
  const tcal = useTranslations("Calendar")
  const { stats } = useVenue()
  const { todayIso } = useData()
  const {
    venueId,
    venue: VENUE,
    venueCourts: VENUE_COURTS,
    reservations: RESERVATIONS,
    addReservation,
    updateReservation,
    courtDayEvents,
    venueScheduleFor,
  } = useVenueData()

  // Which schedule events are backed by a real (persistable) reservation — the
  // synthetic seed-filler blocks from `courtDayEvents` are not, so only these
  // get the live Cancel / Reschedule actions.
  const reservationIds = React.useMemo(
    () => new Set(RESERVATIONS.map((r) => r.id)),
    [RESERVATIONS]
  )

  const now = useNow()
  const [view, setView] = React.useState<CalendarView>("day")
  const [cursor, setCursor] = React.useState<string>(todayIso)
  const [weekCourtId, setWeekCourtId] = React.useState<string>(
    VENUE_COURTS[0]?.id ?? ""
  )
  const [walkInDialog, setWalkInDialog] = React.useState<{
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null>(null)
  const [rescheduleDialog, setRescheduleDialog] = React.useState<{
    reservationId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null>(null)
  const [, startCancel] = React.useTransition()
  // The API requires a reason for any cancellation, so Cancel opens this
  // dialog to collect one instead of firing straight from the popover.
  const [cancelTarget, setCancelTarget] = React.useState<ScheduleEvent | null>(
    null
  )
  const [cancelReason, setCancelReason] = React.useState("")

  const requestCancel = React.useCallback((event: ScheduleEvent) => {
    setCancelReason("")
    setCancelTarget(event)
  }, [])

  const confirmCancel = React.useCallback(() => {
    const event = cancelTarget
    const reason = cancelReason.trim()
    if (!event || reason.length < 3) return
    setCancelTarget(null)
    startCancel(async () => {
      try {
        await cancelReservation(venueId, event.id, reason)
        updateReservation(event.id, { status: "cancelled" })
        toast(t("toast.cancelledEvent"), { description: event.customer })
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to cancel booking"
        )
      }
    })
  }, [cancelTarget, cancelReason, venueId, updateReservation, t])

  const monthsShort = tcal.raw("monthsShort") as string[]
  const months = tcal.raw("months") as string[]
  const weekdaysShort = tcal.raw("weekdaysShort") as string[]

  const openStart = toMin(VENUE.openFrom)
  const openEnd = toMin(VENUE.openTo)

  /** Free gaps (complement of the events) within the open window. */
  const gapsOf = React.useCallback(
    (events: ScheduleEvent[]): { start: string; durationMin: number }[] => {
      const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start))
      const bands: { start: string; durationMin: number }[] = []
      let cursor = openStart
      for (const e of sorted) {
        const s = toMin(e.start)
        if (s > cursor)
          bands.push({
            start: addMinutes("00:00", cursor),
            durationMin: s - cursor,
          })
        cursor = Math.max(cursor, s + e.durationMin)
      }
      if (cursor < openEnd)
        bands.push({
          start: addMinutes("00:00", cursor),
          durationMin: openEnd - cursor,
        })
      return bands
    },
    [openStart, openEnd]
  )

  /** Closed-hours shading (before opening / after closing) for one column. */
  const closedShading = (
    <>
      {openStart > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-muted/40"
          style={{ height: openStart * PX_PER_MIN }}
        />
      ) : null}
      {openEnd < 24 * 60 ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-0 bg-muted/40"
          style={{
            top: openEnd * PX_PER_MIN,
            height: (24 * 60 - openEnd) * PX_PER_MIN,
          }}
        />
      ) : null}
    </>
  )

  /** Place one court's events + free gaps on a date into a timeline column. */
  const courtContent = (court: VenueCourt, dateIso: string) => {
    const events = courtDayEvents(court.id, dateIso)
    const gaps = court.state === "maintenance" ? [] : gapsOf(events)
    return (
      <>
        {closedShading}
        {gaps.map((g) => (
          <FreeBand
            key={`${court.id}-${dateIso}-${g.start}`}
            courtId={court.id}
            courtName={court.name}
            dayKey={dateIso}
            start={g.start}
            durationMin={g.durationMin}
            t={t}
            onAddWalkIn={(input) => setWalkInDialog(input)}
          />
        ))}
        {events.map((ev) => (
          <EventBlock
            key={ev.id}
            event={ev}
            courtName={court.name}
            persisted={reservationIds.has(ev.id)}
            locale={locale}
            t={t}
            tc={tc}
            onCancel={requestCancel}
            onReschedule={() =>
              setRescheduleDialog({
                reservationId: ev.id,
                courtName: court.name,
                dayKey: dateIso,
                start: ev.start,
                durationMin: ev.durationMin,
              })
            }
          />
        ))}
      </>
    )
  }

  // Columns: Day = one per court (cursor date); Week = one per day (selected court).
  const weekCourt =
    VENUE_COURTS.find((c) => c.id === weekCourtId) ?? VENUE_COURTS[0]

  const columns: TimelineColumn[] = (() => {
    if (view === "day") {
      const today = isToday(cursor, todayIso)
      return VENUE_COURTS.map((court) => ({
        key: court.id,
        today,
        header: (
          <div>
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
        ),
        content: courtContent(court, cursor),
      }))
    }
    if (view === "week" && weekCourt) {
      return weekDays(cursor).map((iso) => ({
        key: iso,
        today: isToday(iso, todayIso),
        weekend: isWeekend(iso),
        header: (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 truncate text-sm font-semibold",
                isToday(iso, todayIso) && "text-brand"
              )}
            >
              <span className="text-muted-foreground">
                {weekdaysShort[mondayIndex(iso)]}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  isToday(iso, todayIso) &&
                    "grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
                )}
              >
                {dayOfMonth(iso)}
              </span>
            </span>
          </div>
        ),
        content: courtContent(weekCourt, iso),
      }))
    }
    return []
  })()

  // Day summary (occupancy / booked / free) for the cursor date.
  const summary = React.useMemo(() => {
    const grid = venueScheduleFor(cursor)
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
  }, [cursor, venueScheduleFor])

  /** Venue occupancy % on a date (drives the month heat). */
  const occupancyOn = React.useCallback(
    (iso: string) => {
      const grid = venueScheduleFor(iso)
      let bookable = 0
      let filled = 0
      for (const row of grid)
        for (const slot of row) {
          if (slot.kind === "blocked") continue
          bookable++
          if (slot.kind !== "free") filled++
        }
      return bookable ? Math.round((filled / bookable) * 100) : 0
    },
    [venueScheduleFor]
  )

  const periodLabel = React.useMemo(() => {
    if (view === "month") return `${months[monthOf(cursor)]} ${yearOf(cursor)}`
    if (view === "day")
      return `${weekdaysShort[mondayIndex(cursor)]}, ${dayOfMonth(cursor)} ${
        monthsShort[monthOf(cursor)]
      }`
    const days = weekDays(cursor)
    const a = days[0]
    const b = days[6]
    return sameMonth(a, b)
      ? `${dayOfMonth(a)}–${dayOfMonth(b)} ${monthsShort[monthOf(a)]}`
      : `${dayOfMonth(a)} ${monthsShort[monthOf(a)]} – ${dayOfMonth(b)} ${
          monthsShort[monthOf(b)]
        }`
  }, [view, cursor, months, monthsShort, weekdaysShort])

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

  const activeDay = isToday(cursor, todayIso)

  return (
    <div className="flex flex-col gap-5">
      {/* Heading */}
      {!embedded ? (
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { day: periodLabel })}
          </p>
        </div>
      ) : null}

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
          activeDay && now ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {t("grid.liveAt", { time: now })}
            </span>
          ) : null
        }
      >
        <CalendarToolbar
          periodLabel={periodLabel}
          view={view}
          onView={setView}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setCursor(todayIso)}
          live={showsToday && now ? t("grid.liveAt", { time: now }) : null}
        />

        {/* Court picker (week view shows one court across the week) */}
        {view === "week" ? (
          <div className="-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1 pb-1">
            {VENUE_COURTS.map((court) => {
              const active = court.id === weekCourt?.id
              return (
                <button
                  key={court.id}
                  type="button"
                  onClick={() => setWeekCourtId(court.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    active
                      ? "bg-brand/12 text-brand ring-brand/25"
                      : "text-muted-foreground ring-border hover:bg-muted/60"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      sportAccent(court.sport)
                    )}
                    aria-hidden
                  />
                  {court.name}
                </button>
              )
            })}
          </div>
        ) : null}

        {view === "month" ? (
          <MonthGrid
            cursor={cursor}
            todayIso={todayIso}
            onPickDay={openDay}
            renderDay={(iso, inMonth) =>
              inMonth ? (
                <div className="mt-auto flex w-full flex-col gap-1">
                  <span className="hidden font-mono text-[10px] text-muted-foreground tabular-nums sm:block">
                    {occupancyOn(iso)}%
                  </span>
                  <Meter pct={occupancyOn(iso)} className="h-1" />
                </div>
              ) : null
            }
          />
        ) : (
          <Timeline
            columns={columns}
            now={now}
            single={columns.length === 1}
            scrollKey={`${view}:${cursor}:${weekCourtId}`}
            minColPx={120}
          />
        )}

        {/* Legend */}
        {view !== "month" ? (
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
        ) : null}
      </VenuePanel>

      <WalkInDialog
        locale={locale}
        venueId={venueId}
        reservation={walkInDialog}
        onClose={() => setWalkInDialog(null)}
        onCreated={addReservation}
        t={t}
      />

      <RescheduleDialog
        locale={locale}
        venueId={venueId}
        reservation={rescheduleDialog}
        onClose={() => setRescheduleDialog(null)}
        onRescheduled={(updated) =>
          updateReservation(updated.id, {
            dayKey: updated.dayKey,
            day: updated.day,
            start: updated.start,
            durationMin: updated.durationMin,
            time: updated.time,
            price: updated.price,
          })
        }
        t={t}
      />

      <ReasonDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null)
        }}
        title={t("cancelDialog.title")}
        description={t("cancelDialog.description", {
          name: cancelTarget?.customer ?? "",
        })}
        reasonLabel={t("cancelDialog.reasonLabel")}
        reasonPlaceholder={t("cancelDialog.reasonPlaceholder")}
        cancelLabel={t("cancelDialog.cancel")}
        confirmLabel={t("cancelDialog.confirm")}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

/** A booked / walk-in / maintenance block, sized to its real duration. */
function EventBlock({
  event,
  courtName,
  persisted,
  locale,
  t,
  tc,
  onCancel,
  onReschedule,
}: {
  event: ScheduleEvent
  courtName: string
  /** True when the event is a real reservation (so Cancel/Reschedule persist). */
  persisted: boolean
  locale: string
  t: ReturnType<typeof useTranslations>
  tc: ReturnType<typeof useTranslations>
  onCancel: (event: ScheduleEvent) => void
  onReschedule: (event: ScheduleEvent) => void
}) {
  const top = toMin(event.start) * PX_PER_MIN
  const height = Math.max(18, event.durationMin * PX_PER_MIN - 2)
  const end = addMinutes(event.start, event.durationMin)
  const compact = height < 46
  const blocked = event.kind === "blocked"
  const Icon = event.kind === "walk-in" ? Footprints : Users
  const infoCopy =
    locale === "vi"
      ? {
          customer: "Khách đặt sân",
          phone: "Số điện thoại",
          noPhone: "Chưa có số điện thoại",
        }
      : {
          customer: "Customer",
          phone: "Phone",
          noPhone: "No phone number",
        }

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
                <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {infoCopy.customer}
                  </div>
                  <div className="mt-1 font-medium">{event.customer}</div>
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3.5" />
                    <span>{event.customerPhone ?? infoCopy.noPhone}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start rounded-full"
                  disabled={!persisted}
                  onClick={() => onReschedule(event)}
                >
                  <CalendarClock />
                  {t("event.reschedule")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start rounded-full text-destructive"
                  disabled={!persisted}
                  onClick={() => onCancel(event)}
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

function WalkInDialog({
  locale,
  venueId,
  reservation,
  onClose,
  onCreated,
  t,
}: {
  locale: string
  venueId: string
  reservation: {
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null
  onClose: () => void
  onCreated: (reservation: Reservation) => void
  t: ReturnType<typeof useTranslations>
}) {
  const copy =
    locale === "vi"
      ? {
          title: "Thêm khách vãng lai",
          description:
            "Nhập tên, số điện thoại, giờ bắt đầu và thời lượng để giữ khung sân này.",
          name: "Tên khách",
          phone: "Số điện thoại",
          start: "Giờ bắt đầu",
          duration: "Thời lượng (phút)",
          cancel: "Hủy",
          submit: "Giữ sân",
          saving: "Đang lưu...",
        }
      : {
          title: "Add walk-in",
          description:
            "Enter the guest's name, phone, start time and duration to hold this court.",
          name: "Guest name",
          phone: "Phone number",
          start: "Start time",
          duration: "Duration (minutes)",
          cancel: "Cancel",
          submit: "Hold court",
          saving: "Saving...",
        }
  const [name, setName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [start, setStart] = React.useState("06:00")
  const [durationMin, setDurationMin] = React.useState("60")
  const [isPending, startTransition] = React.useTransition()

  const [prevReservation, setPrevReservation] = React.useState<typeof reservation>(null)

  if (reservation !== prevReservation) {
    setPrevReservation(reservation)
    if (reservation) {
      setName("")
      setPhone("")
      setStart(reservation.start)
      setDurationMin(String(Math.max(15, reservation.durationMin)))
    }
  }

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reservation) return
    startTransition(async () => {
      try {
        const created = await addWalkInReservation(venueId, {
          courtId: reservation.courtId,
          dayKey: reservation.dayKey,
          start,
          durationMin: Number(durationMin),
          customerName: name,
          customerPhone: phone,
        })
        onCreated(created)
        toast.success(t("toast.walkInTitle"), {
          description: `${reservation.courtName} · ${created.time}`,
        })
        onClose()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add walk-in"
        )
      }
    })
  }

  return (
    <Dialog open={reservation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {reservation ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {reservation.courtName} · {start}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {copy.name}
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {copy.phone}
              <Input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.start}
                <Input
                  required
                  type="time"
                  step={900}
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.duration}
                <Input
                  required
                  min={15}
                  step={15}
                  type="number"
                  value={durationMin}
                  onChange={(event) => setDurationMin(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? copy.saving : copy.submit}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RescheduleDialog({
  locale,
  venueId,
  reservation,
  onClose,
  onRescheduled,
  t,
}: {
  locale: string
  venueId: string
  reservation: {
    reservationId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null
  onClose: () => void
  onRescheduled: (reservation: Reservation) => void
  t: ReturnType<typeof useTranslations>
}) {
  const copy =
    locale === "vi"
      ? {
          title: "Đổi lịch đặt sân",
          description: "Chọn ngày, giờ bắt đầu và thời lượng mới cho lượt đặt.",
          day: "Ngày",
          start: "Giờ bắt đầu",
          duration: "Thời lượng (phút)",
          cancel: "Hủy",
          submit: "Đổi lịch",
          saving: "Đang lưu...",
        }
      : {
          title: "Reschedule booking",
          description: "Pick a new day, start time and duration for this booking.",
          day: "Day",
          start: "Start time",
          duration: "Duration (minutes)",
          cancel: "Cancel",
          submit: "Reschedule",
          saving: "Saving...",
        }
  const { bookingDays } = useData()
  const [dayKey, setDayKey] = React.useState("")
  const [start, setStart] = React.useState("06:00")
  const [durationMin, setDurationMin] = React.useState("60")
  const [isPending, startTransition] = React.useTransition()

  // Seed the form from the reservation each time the dialog opens (mirrors
  // WalkInDialog) rather than syncing in an effect.
  const [prevReservation, setPrevReservation] =
    React.useState<typeof reservation>(null)
  if (reservation !== prevReservation) {
    setPrevReservation(reservation)
    if (reservation) {
      setDayKey(reservation.dayKey)
      setStart(reservation.start)
      setDurationMin(String(Math.max(15, reservation.durationMin)))
    }
  }

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reservation) return
    startTransition(async () => {
      try {
        const updated = await rescheduleReservation(
          venueId,
          reservation.reservationId,
          { dayKey, start, durationMin: Number(durationMin) }
        )
        onRescheduled(updated)
        toast.success(t("toast.rescheduled"), {
          description: `${reservation.courtName} · ${updated.time}`,
        })
        onClose()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to reschedule"
        )
      }
    })
  }

  return (
    <Dialog
      open={reservation !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {reservation ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {reservation.courtName}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {copy.day}
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                value={dayKey}
                onChange={(event) => setDayKey(event.target.value)}
              >
                {bookingDays.map((day) => (
                  <option key={day.key} value={day.key}>
                    {locale === "vi" ? day.label.vi : day.label.en}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.start}
                <Input
                  required
                  type="time"
                  step={900}
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {copy.duration}
                <Input
                  required
                  min={15}
                  step={15}
                  type="number"
                  value={durationMin}
                  onChange={(event) => setDurationMin(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? copy.saving : copy.submit}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** A free gap — subtle until hovered, click to add a walk-in or block it. */
function FreeBand({
  courtId,
  courtName,
  dayKey,
  start,
  durationMin,
  onAddWalkIn,
  t,
}: {
  courtId: string
  courtName: string
  dayKey: string
  start: string
  durationMin: number
  onAddWalkIn: (input: {
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  }) => void
  t: ReturnType<typeof useTranslations>
}) {
  const top = toMin(start) * PX_PER_MIN
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
                  onAddWalkIn({
                    courtId,
                    courtName,
                    dayKey,
                    start,
                    durationMin: Math.min(60, Math.max(15, durationMin)),
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
