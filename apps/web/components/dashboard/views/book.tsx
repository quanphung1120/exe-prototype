"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Lock,
  MapPin,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Star,
  TriangleAlert,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  COURT_OPEN_FROM,
  COURT_OPEN_TO,
  SPORTS,
  addMinutes,
  diffMinutes,
  formatDuration,
  formatVnd,
  formatVndFull,
  priceFor,
  slotRange,
  type Court,
  type SportKey,
} from "@/components/dashboard/data"
import {
  addDays,
  addMonths,
  dateForDayKey,
  dayKeyForDate,
  dayOfMonth,
  isToday,
  isWeekend,
  mondayIndex,
  monthOf,
  sameMonth,
  TODAY_ISO,
  weekDays,
  yearOf,
  type CalendarView,
} from "@/components/dashboard/calendar"
import {
  CalendarToolbar,
  MonthGrid,
  PX_PER_MIN,
  Timeline,
  toMin,
  useNow,
  type TimelineColumn,
} from "@/components/dashboard/calendar-ui"
import { useData } from "@/components/dashboard/data-provider"
import { useBooking } from "@/components/dashboard/booking"

/** Shared surface styling for each step's card(s). */
const CARD =
  "rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:p-6 dark:ring-foreground/10"

/**
 * A deterministic, decorative QR-like glyph — NOT a scannable code. Modules are
 * derived from a string seed (no Date/random) so SSR and client renders agree.
 */
function FakeQr({ seed }: { seed: string }) {
  const N = 21
  const inFinder = (x: number, y: number) => {
    const box = (bx: number, by: number) =>
      x >= bx && x <= bx + 6 && y >= by && y <= by + 6
    return box(0, 0) || box(N - 7, 0) || box(0, N - 7)
  }
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y)) continue
      h ^= (x + 1) * 374761393 + (y + 1) * 668265263
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      if (h % 100 < 48) cells.push({ x, y })
    }
  }
  const finder = (bx: number, by: number) => (
    <g key={`f-${bx}-${by}`}>
      <rect x={bx} y={by} width={7} height={7} rx={1.4} fill="currentColor" />
      <rect x={bx + 1} y={by + 1} width={5} height={5} rx={1} fill="white" />
      <rect
        x={bx + 2}
        y={by + 2}
        width={3}
        height={3}
        rx={0.6}
        fill="currentColor"
      />
    </g>
  )
  return (
    <svg
      viewBox="0 0 21 21"
      className="size-40 text-neutral-900"
      role="img"
      aria-hidden
      shapeRendering="crispEdges"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill="currentColor"
        />
      ))}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
  )
}

/** Segmented single-select chips (same pattern as the Quick Join filters). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={o.value === value ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

/**
 * The court-booking wizard, rendered as a full dashboard page (it used to live
 * in a small dialog, which left no room for the day calendar — especially on
 * phones). The flow, steps and faked payment are unchanged; only the chrome
 * around them is now a page with a sticky action bar and a roomy calendar.
 */
export function BookView() {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")
  const {
    open,
    closeBooking,
    armBooking,
    court,
    courtId,
    roomId,
    steps,
    step,
    draft,
    draftConflict,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setDuration,
    pickSlot,
    paying,
    pay,
  } = useBooking()
  const { courts: COURTS } = useData()

  // Cold load / direct navigation: nothing armed the wizard, so default to a
  // fresh, courtless booking instead of rendering a stale draft.
  React.useEffect(() => {
    if (!open) armBooking(null, { fillMode: "court" })
  }, [open, armBooking])

  const [courtQuery, setCourtQuery] = React.useState("")

  const stepName = steps[step]

  // Free-form booking: a start + end time (any minute), priced pro-rata.
  const total = court ? priceFor(court.pricePerHour, draft.durationMin) : 0
  const endTime = draft.slot ? addMinutes(draft.slot, draft.durationMin) : ""
  const setEnd = (end: string) => {
    if (!draft.slot || !end) return
    const d = diffMinutes(draft.slot, end)
    if (d > 0) setDuration(d)
  }

  // Court step search
  const needle = courtQuery.trim().toLowerCase()
  const courtResults = needle
    ? COURTS.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.district.toLowerCase().includes(needle)
      )
    : COURTS

  // Confirm step — the typed reason (court-taken / self-overlap) or null.
  const conflict = draftConflict
  const playersLine =
    draft.fillMode === "find" && !roomId
      ? t("finding")
      : roomId
        ? t("goingCount", { count: 1 + draft.invitees.length })
        : draft.invitees.length
          ? t("goingInvited", { going: 1, invited: draft.invitees.length })
          : t("justYou")

  const canNext =
    stepName === "court"
      ? Boolean(courtId)
      : stepName === "slot"
        ? Boolean(draft.slot) && !draftConflict
        : true

  // Pay step — transfer via QR is the only method, so paying is always ready.
  const canPay = !paying

  const title = court ? t("title", { court: court.name }) : t("pickTitle")

  // Until the effect above arms a fresh booking, there's nothing to show.
  if (!open) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit rounded-full text-muted-foreground"
          onClick={closeBooking}
          disabled={paying}
        >
          <ArrowLeft />
          {t("close")}
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium",
                  i === step
                    ? "text-foreground"
                    : i < step
                      ? "text-brand"
                      : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[10px] tabular-nums",
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-brand/15 text-brand"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t(`steps.${s}`)}</span>
              </span>
              {i < steps.length - 1 ? (
                <span className="h-px flex-1 bg-border" />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content — one card per step; the slot step splits into two */}
      <div className="flex w-full flex-col">
        {/* COURT */}
        {stepName === "court" ? (
          <div className="flex w-full flex-col gap-4">
            <div className="relative my-3 w-full max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={courtQuery}
                onChange={(e) => setCourtQuery(e.target.value)}
                placeholder={t("courtSearch")}
                aria-label={t("courtSearch")}
                className="h-9 pl-8"
              />
            </div>
            {courtResults.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {courtResults.map((c) => (
                  <CourtPickCard
                    key={c.id}
                    court={c}
                    selected={courtId === c.id}
                    onChoose={() => {
                      setCourt(c.id)
                      next()
                    }}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("noCourts")}
              </p>
            )}
          </div>
        ) : null}

        {/* SLOT */}
        {stepName === "slot" ? (
          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            {/* Calendar — its own card, stretched across the left column */}
            <div className={cn(CARD, "flex flex-col gap-4")}>
              <CourtCalendar
                courtId={courtId}
                slot={draft.slot}
                dayKey={draft.dayKey}
                durationMin={draft.durationMin}
                onPick={(dk, start, dur) => {
                  setDay(dk)
                  pickSlot(start, dur)
                }}
              />
            </div>

            {/* Specific time — right column */}
            <div className={cn(CARD, "flex flex-col gap-4")}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("startTime")}</Label>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="time"
                      value={draft.slot ?? ""}
                      min={COURT_OPEN_FROM}
                      max={COURT_OPEN_TO}
                      onChange={(e) => setSlot(e.target.value)}
                      aria-label={t("startTime")}
                      className="h-9 pl-8 tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("endTime")}</Label>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="time"
                      value={endTime}
                      min={draft.slot ?? COURT_OPEN_FROM}
                      max={COURT_OPEN_TO}
                      disabled={!draft.slot}
                      onChange={(e) => setEnd(e.target.value)}
                      aria-label={t("endTime")}
                      className="h-9 pl-8 tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("quickDuration")}</Label>
                <Segmented
                  value={String(draft.durationMin)}
                  onChange={(v) => setDuration(Number(v))}
                  options={[60, 90, 120].map((m) => ({
                    value: String(m),
                    label: formatDuration(m),
                  }))}
                />
              </div>

              {draft.slot ? (
                <div
                  className={cn(
                    "flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-sm ring-1",
                    draftConflict
                      ? "bg-destructive/8 ring-destructive/20"
                      : "bg-brand/8 ring-brand/15"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-medium",
                      draftConflict ? "text-destructive" : "text-brand"
                    )}
                  >
                    {draftConflict ? (
                      <TriangleAlert className="size-4 shrink-0" />
                    ) : (
                      <Check className="size-4 shrink-0" />
                    )}
                    {draftConflict === "self-overlap"
                      ? t("conflictSelf")
                      : draftConflict === "court-taken"
                        ? t("conflictCourt")
                        : t("available")}
                  </span>
                  {!draftConflict ? (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {draft.slot} – {endTime} ·{" "}
                      {formatDuration(draft.durationMin)} · {formatVnd(total)}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("pickStartHint")}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* CONFIRM */}
        {stepName === "confirm" && court && draft.slot ? (
          <div className="grid w-full gap-4 lg:grid-cols-2 lg:items-start">
            {/* Summary */}
            <div className={cn(CARD, "flex flex-col gap-3")}>
              <SummaryRow label={t("steps.court")} value={court.name} />
              <SummaryRow
                label={t("when")}
                value={`${t(`days.${draft.dayKey}`)} · ${slotRange(
                  draft.slot,
                  draft.durationMin
                )}`}
              />
              <SummaryRow
                label={t("durationLabel")}
                value={formatDuration(draft.durationMin)}
              />
              {roomId ? (
                <SummaryRow
                  label={t("format")}
                  value={tc(`format.${draft.format.toLowerCase()}`)}
                />
              ) : null}
              <SummaryRow label={t("players")} value={playersLine} />
              <SummaryRow label={t("price")} value={formatVnd(total)} />
              {conflict ? (
                <p className="text-xs font-medium text-destructive">
                  {conflict === "self-overlap"
                    ? t("conflictSelf")
                    : t("conflictCourt")}
                </p>
              ) : null}
            </div>

            {/* Court preview */}
            <div className={cn(CARD, "flex flex-col overflow-hidden p-0")}>
              <CourtImage court={court} />
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <div className="flex flex-col gap-1">
                  <p className="font-heading text-lg leading-tight font-semibold">
                    {court.name}
                  </p>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">
                      {court.district} ·{" "}
                      {t("distance", { km: court.distanceKm })}
                    </span>
                  </p>
                </div>
                <div className="flex flex-col gap-1 rounded-3xl bg-gradient-to-br from-brand/12 to-lime/10 p-4 ring-1 ring-brand/15">
                  <Label>{t("price")}</Label>
                  <span className="font-heading text-2xl leading-none font-bold tracking-tight tabular-nums">
                    {formatVndFull(total)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(`days.${draft.dayKey}`)} ·{" "}
                    {slotRange(draft.slot, draft.durationMin)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* PAY — bank transfer via QR only */}
        {stepName === "pay" && court && draft.slot ? (
          <div className="grid w-full gap-4 lg:grid-cols-2 lg:items-start">
            {/* Left — amount & method */}
            <div className={cn(CARD, "flex flex-col gap-4")}>
              {/* Amount due */}
              <div className="flex flex-col gap-1 rounded-3xl bg-gradient-to-br from-brand/12 to-lime/10 p-4 ring-1 ring-brand/15">
                <Label>{t("pay.amountDue")}</Label>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading text-3xl leading-none font-bold tracking-tight tabular-nums">
                    {formatVndFull(total)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("pay.courtFee")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {court.name} · {t(`days.${draft.dayKey}`)} ·{" "}
                  {slotRange(draft.slot, draft.durationMin)}
                </p>
              </div>

              {/* Method — transfer via QR is the only option */}
              <div className="flex flex-col gap-1.5">
                <Label>{t("pay.method")}</Label>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand bg-brand/8 px-3 py-1.5 text-sm font-medium text-brand">
                  <QrCode className="size-4 shrink-0" />
                  {t("pay.qr")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("pay.qrOnly")}
                </p>
              </div>

              {/* Demo disclaimer */}
              <p className="mt-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" />
                {t("pay.secure")}
              </p>
            </div>

            {/* Right — scan to transfer */}
            <div
              className={cn(
                CARD,
                "flex flex-col items-center justify-center gap-3"
              )}
            >
              <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                <FakeQr seed={`${court.id}:${draft.dayKey}:${draft.slot}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{t("pay.qrAccount")}</p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatVndFull(total)}
                </p>
              </div>
              <p className="inline-flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                <QrCode className="size-3.5 shrink-0" />
                {t("pay.qrHint")}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Action bar — sticky on phones so the primary action stays reachable. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {step > 0 ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={back}
            disabled={paying}
          >
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {stepName === "pay" ? (
          <Button className="rounded-full" disabled={!canPay} onClick={pay}>
            {paying ? (
              <>
                <Loader2 className="animate-spin" />
                {t("pay.processing")}
              </>
            ) : (
              <>
                <Lock />
                {t("pay.payNow", { amount: court ? formatVnd(total) : "" })}
              </>
            )}
          </Button>
        ) : stepName === "confirm" ? (
          <Button
            className="rounded-full"
            disabled={Boolean(conflict) || !court || !draft.slot}
            onClick={next}
          >
            {t("toPayment")}
          </Button>
        ) : (
          <Button className="rounded-full" disabled={!canNext} onClick={next}>
            {t("next")}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * The court availability calendar in the booking wizard. Day / Week / Month
 * views of ONE court: booked blocks show occupied, free gaps are tappable to
 * seed a start time, and the current draft selection floats on top as a brand
 * band. Only the bookable days (today/tomorrow/sat/sun/mon) are interactive —
 * other days are shown for context. Tapping a gap sets the day + start; the
 * player fine-tunes the exact start/end in the panel beside it.
 */
function CourtCalendar({
  courtId,
  slot,
  dayKey,
  durationMin,
  onPick,
}: {
  courtId: string | null
  slot: string | null
  dayKey: string
  durationMin: number
  onPick: (dayKey: string, start: string, durationMin: number) => void
}) {
  const t = useTranslations("Booking")
  const tcal = useTranslations("Calendar")
  const { courtDayBusy, courtDayGaps } = useData()
  const { sessions, roomId } = useBooking()
  const now = useNow()

  const [view, setView] = React.useState<CalendarView>("day")
  const [cursor, setCursor] = React.useState<string>(
    dateForDayKey(dayKey) ?? TODAY_ISO
  )

  const weekdaysShort = tcal.raw("weekdaysShort") as string[]
  const monthsShort = tcal.raw("monthsShort") as string[]
  const months = tcal.raw("months") as string[]

  const selDate = dateForDayKey(dayKey)
  const gapsOn = (dk: string) =>
    courtId ? courtDayGaps(sessions, courtId, dk, roomId ?? undefined) : []

  /** One day's free gaps, booked blocks and (if it's the draft day) selection. */
  const dayContent = (iso: string): React.ReactNode => {
    const dk = dayKeyForDate(iso)
    const busy =
      dk && courtId
        ? courtDayBusy(sessions, courtId, dk, roomId ?? undefined)
        : []
    const gaps = dk ? gapsOn(dk) : []
    return (
      <>
        {dk
          ? gaps.map((g) => {
              const height = g.durationMin * PX_PER_MIN
              if (height < 14) return null
              return (
                <button
                  key={`free-${iso}-${g.start}`}
                  type="button"
                  onClick={() =>
                    onPick(dk, g.start, Math.min(60, g.durationMin))
                  }
                  className="group/free absolute inset-x-1 z-0 flex items-center justify-center rounded-lg text-brand/0 transition-colors hover:bg-brand/8 hover:text-brand focus-visible:bg-brand/8 focus-visible:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  style={{ top: toMin(g.start) * PX_PER_MIN, height }}
                  aria-label={t("freeAt", { time: g.start })}
                >
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium opacity-0 transition-opacity group-hover/free:opacity-100 group-focus-visible/free:opacity-100">
                    <Plus className="size-3" />
                    {t("free")}
                  </span>
                </button>
              )
            })
          : null}

        {busy.map((b) => {
          const height = Math.max(0, b.durationMin * PX_PER_MIN - 2)
          if (height <= 0) return null
          const end = addMinutes(b.start, b.durationMin)
          return (
            <div
              key={`busy-${iso}-${b.start}`}
              className="pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-lg bg-muted [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,color-mix(in_oklch,var(--muted-foreground)_8%,transparent)_5px,color-mix(in_oklch,var(--muted-foreground)_8%,transparent)_10px)] px-2 py-1 text-muted-foreground ring-1 ring-border/60"
              style={{ top: toMin(b.start) * PX_PER_MIN + 1, height }}
            >
              {height >= 26 ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                    <Lock className="size-3 shrink-0" />
                    {t("busy")}
                  </span>
                  {height >= 40 ? (
                    <span className="block font-mono text-[10px] leading-none tabular-nums opacity-70">
                      {b.start} – {end}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          )
        })}

        {slot && selDate === iso ? (
          <div
            className="pointer-events-none absolute inset-x-1 z-20 flex flex-col justify-center overflow-hidden rounded-lg bg-brand/15 px-2 py-1 text-brand ring-2 ring-brand/60"
            style={{
              top: toMin(slot) * PX_PER_MIN,
              height: durationMin * PX_PER_MIN,
            }}
          >
            <span className="truncate text-[11px] font-semibold">
              {t("yourSlot")}
            </span>
            {durationMin * PX_PER_MIN >= 34 ? (
              <span className="font-mono text-[10px] leading-none tabular-nums">
                {slot} – {addMinutes(slot, durationMin)}
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    )
  }

  /** Header for one day column: weekday + date + open-slot count. */
  const dayHeader = (iso: string): React.ReactNode => {
    const dk = dayKeyForDate(iso)
    const free = dk ? gapsOn(dk).length : 0
    return (
      <div className="flex items-center justify-between gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 truncate text-sm font-semibold",
            isToday(iso) && "text-brand",
            !dk && "text-muted-foreground/60"
          )}
        >
          <span className="text-muted-foreground">
            {weekdaysShort[mondayIndex(iso)]}
          </span>
          <span
            className={cn(
              "tabular-nums",
              isToday(iso) &&
                "grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
            )}
          >
            {dayOfMonth(iso)}
          </span>
        </span>
        {free ? (
          <span className="rounded-full bg-brand/12 px-1.5 text-[10px] font-semibold text-brand tabular-nums">
            {free}
          </span>
        ) : null}
      </div>
    )
  }

  const days =
    view === "day" ? [cursor] : view === "week" ? weekDays(cursor) : []
  const columns: TimelineColumn[] = days.map((iso) => ({
    key: iso,
    today: isToday(iso),
    weekend: isWeekend(iso),
    header: dayHeader(iso),
    content: dayContent(iso),
  }))

  const periodLabel =
    view === "month"
      ? `${months[monthOf(cursor)]} ${yearOf(cursor)}`
      : view === "day"
        ? `${weekdaysShort[mondayIndex(cursor)]}, ${dayOfMonth(cursor)} ${
            monthsShort[monthOf(cursor)]
          }`
        : (() => {
            const w = weekDays(cursor)
            return sameMonth(w[0], w[6])
              ? `${dayOfMonth(w[0])}–${dayOfMonth(w[6])} ${monthsShort[monthOf(w[0])]}`
              : `${dayOfMonth(w[0])} ${monthsShort[monthOf(w[0])]} – ${dayOfMonth(
                  w[6]
                )} ${monthsShort[monthOf(w[6])]}`
          })()

  const step = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "day"
        ? addDays(c, dir)
        : view === "week"
          ? addDays(c, dir * 7)
          : addMonths(c, dir)
    )

  if (!courtId) return null

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        periodLabel={periodLabel}
        view={view}
        onView={setView}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => setCursor(TODAY_ISO)}
      />

      {view === "month" ? (
        <MonthGrid
          cursor={cursor}
          onPickDay={(iso) => {
            setCursor(iso)
            setView("day")
          }}
          renderDay={(iso, inMonth) => {
            const dk = inMonth ? dayKeyForDate(iso) : null
            const free = dk ? gapsOn(dk).length : 0
            return free ? (
              <span className="mt-auto inline-flex items-center gap-1 rounded-md bg-brand/12 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                <span className="size-1.5 rounded-full bg-brand" aria-hidden />
                {free}
              </span>
            ) : null
          }}
        />
      ) : (
        <Timeline
          columns={columns}
          now={now}
          single={view === "day"}
          scrollKey={`${view}:${cursor}`}
        />
      )}
    </div>
  )
}

// Per-sport tint for the decorative court banner (keyed by the court's first
// listed sport). The prototype has no real court photos, so each card's "image"
// is a deterministic gradient + court-line grid + oversized sport monogram.
const COURT_IMG: Record<SportKey, string> = {
  tennis: "from-chart-2/35 via-brand/15 to-lime/20",
  pickleball: "from-lime/45 via-brand/15 to-chart-2/20",
  badminton: "from-chart-3/35 via-brand/15 to-lime/20",
}

/** Decorative court "photo" — see COURT_IMG. */
function CourtImage({ court }: { court: Court }) {
  const sport = court.sports[0]
  const short = SPORTS.find((s) => s.key === sport)?.short ?? ""
  return (
    <div
      className={cn(
        "relative h-24 w-full shrink-0 overflow-hidden bg-gradient-to-br",
        COURT_IMG[sport]
      )}
      aria-hidden
    >
      <div className="bg-court-lines absolute inset-0 opacity-70" />
      {/* Center net line */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/10" />
      <span className="absolute -right-2 -bottom-5 font-heading text-6xl font-bold text-foreground/10 select-none">
        {short}
      </span>
    </div>
  )
}

/**
 * A single court in the court-selection grid — a card with a decorative image,
 * the court name, its district + distance (the "address"), price and a Choose
 * button. Choosing selects the court; the sticky action bar advances the wizard.
 */
function CourtPickCard({
  court,
  selected,
  onChoose,
  t,
}: {
  court: Court
  selected: boolean
  onChoose: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-3xl bg-card text-left ring-1 transition-shadow",
        selected
          ? "shadow-md ring-2 ring-brand"
          : "ring-foreground/10 hover:shadow-md"
      )}
    >
      <div className="relative">
        <CourtImage court={court} />
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm backdrop-blur">
          <Star className="size-3 fill-lime text-lime" />
          {court.rating}
        </span>
        {selected ? (
          <span className="absolute top-2 left-2 inline-flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm">
            <Check className="size-3.5" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-heading text-base leading-tight font-semibold">
            {court.name}
          </p>
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">
              {court.district} · {t("distance", { km: court.distanceKm })}
            </span>
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatVnd(court.pricePerHour)}
            <span className="font-normal text-muted-foreground">
              {t("perHour")}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant={selected ? "secondary" : "default"}
            className="rounded-full"
            onClick={onChoose}
          >
            {selected ? (
              <>
                <Check />
                {t("chosen")}
              </>
            ) : (
              t("choose")
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
