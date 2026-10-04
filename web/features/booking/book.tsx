"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  List,
  Loader2,
  Locate,
  LocateFixed,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Radar,
  Search,
  ShieldCheck,
  Star,
  Tag,
  TriangleAlert,
  Users,
  X,
} from "lucide-react"

import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  validateDiscountCode,
  type DiscountValidation,
} from "@/features/play/payment-actions"
import {
  COURT_OPEN_FROM,
  COURT_OPEN_TO,
  addMinutes,
  formatDuration,
  formatVnd,
  formatVndFull,
  locStr,
  priceFor,
  slotRange,
  type Court,
} from "@/features/dashboard/data"
import { addDays, mondayIndex } from "@/features/booking/calendar"
import { toMin } from "@/features/booking/calendar-ui"
import { useData } from "@/features/dashboard/data-provider"
import { useBooking } from "@/features/booking/booking"
import { CourtImage } from "@/features/dashboard/shared"
import { CourtMap } from "@/features/play/court-map"
import { compareDistance, hasCoordinates } from "@/lib/shared/location"

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

/**
 * The court-hold countdown — a time-limited reservation urging the player to
 * pay before it expires. Styled as a standout amber pill (warm against the
 * emerald theme) and placed at the top of the confirm/pay steps.
 */
function HoldBadge({
  time,
  t,
}: {
  time: string
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-500/12 px-3.5 py-1.5 text-sm font-medium text-amber-700 tabular-nums ring-1 ring-amber-500/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
      <Clock className="size-4 shrink-0" />
      {t("pay.holdCountdown", { time })}
    </div>
  )
}

/**
 * The order's price lines — subtotal, an optional discount (as a removable
 * code chip) and the bold final total. Shared by the confirm and pay steps
 * so a code applied on Pay still shows correctly if the player steps back.
 */
function PriceBreakdown({
  subtotal,
  finalTotal,
  appliedDiscount,
  onRemoveDiscount,
  removable,
  t,
}: {
  subtotal: number
  finalTotal: number
  appliedDiscount: DiscountValidation | null
  onRemoveDiscount?: () => void
  removable?: boolean
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t("pay.subtotal")}</span>
        <span className="tabular-nums">{formatVndFull(subtotal)}</span>
      </div>
      {appliedDiscount ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {t("pay.discount")}
            <Badge
              variant="secondary"
              className="gap-1 font-mono text-[10px] tracking-wide"
            >
              {appliedDiscount.code}
              {removable && onRemoveDiscount ? (
                <button
                  type="button"
                  onClick={onRemoveDiscount}
                  aria-label={t("pay.removeDiscount")}
                  className="-mr-0.5 ml-0.5 rounded-full hover:opacity-70"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </Badge>
          </span>
          <span className="text-brand tabular-nums">
            −{formatVndFull(appliedDiscount.discountAmount)}
          </span>
        </div>
      ) : null}
      <div className="h-px bg-border" />
      <div className="flex items-center justify-between gap-3 text-lg font-semibold">
        <span>{t("pay.amountDue")}</span>
        <span className="tabular-nums">{formatVndFull(finalTotal)}</span>
      </div>
    </div>
  )
}

/**
 * The court-booking wizard, rendered as a full dashboard page (it used to live
 * in a small dialog, which left no room for the day calendar — especially on
 * phones). The flow/steps are unchanged; the pay step now hands off to a real
 * SePay checkout instead of a faked QR (see `pay` in `session.tsx`).
 */
export function BookView() {
  const t = useTranslations("Booking")
  const tf = useTranslations("FindCourts")
  const locale = useLocale()
  const ts = useTranslations("Shared")
  const [query, setQuery] = React.useState("")
  const {
    open,
    closeBooking,
    armBooking,
    court,
    courtId,
    roomId,
    sessions,
    steps,
    step,
    draft,
    draftConflict,
    next,
    back,
    setCourt,
    setDay,
    pickSlot,
    paying,
    checkoutError,
    clearCheckoutError,
    pay,
  } = useBooking()
  const { courts: COURTS, dayLabelFor } = useData()

  // Cold load / direct navigation: nothing armed the wizard, so default to a
  // fresh, courtless booking instead of rendering a stale draft.
  React.useEffect(() => {
    if (!open) armBooking(null, { fillMode: "court" })
  }, [open, armBooking])

  const stepName = steps[step]

  // Live countdown on the confirm/pay steps for the court hold started when
  // the slot step was left (see startCourtHold in session.tsx) — ticks only
  // while it's actually shown, not for the whole wizard's lifetime.
  const [holdNow, setHoldNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (stepName !== "confirm" && stepName !== "pay") return
    const tick = () => setHoldNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [stepName])
  const holdExpiresAt = roomId
    ? sessions.find((s) => s.id === roomId)?.holdExpiresAt
    : undefined
  const holdRemainingMs =
    holdExpiresAt != null && holdNow != null
      ? Math.max(0, holdExpiresAt - holdNow)
      : null
  const holdCountdown =
    holdRemainingMs != null
      ? `${Math.floor(holdRemainingMs / 60000)}:${String(
          Math.floor((holdRemainingMs % 60000) / 1000)
        ).padStart(2, "0")}`
      : null

  // Free-form booking: a start + end time (any minute), priced pro-rata.
  const total = court ? priceFor(court.pricePerHour, draft.durationMin) : 0

  // Discount code (mã giảm giá) — validated server-side against `total`
  // before it's ever sent to checkout; applying it just narrates the
  // resulting `finalAmount`/`discountAmount` here, the real deduction
  // happens again on the server when `pay()` calls `startPaymentCheckout`.
  const [discountInput, setDiscountInput] = React.useState("")
  const [discountLoading, setDiscountLoading] = React.useState(false)
  const [discountError, setDiscountError] = React.useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] =
    React.useState<DiscountValidation | null>(null)
  // The `total` a code was validated against — a changed total (duration
  // edited, different court, …) can invalidate a code (min-order thresholds,
  // different caps), so a stale basis is treated as "not applied" below
  // rather than eagerly cleared from an effect.
  const [discountBasis, setDiscountBasis] = React.useState<number | null>(null)

  const applyDiscount = async () => {
    const code = discountInput.trim().toUpperCase()
    if (!code || discountLoading) return
    setDiscountLoading(true)
    setDiscountError(null)
    const result = await validateDiscountCode(code, total)
    setDiscountLoading(false)
    if (!result.ok) {
      setAppliedDiscount(null)
      setDiscountBasis(null)
      setDiscountError(result.message)
      return
    }
    setAppliedDiscount(result.data)
    setDiscountBasis(total)
  }

  const removeDiscount = () => {
    setAppliedDiscount(null)
    setDiscountBasis(null)
    setDiscountInput("")
    setDiscountError(null)
  }

  const activeDiscount =
    appliedDiscount && discountBasis === total ? appliedDiscount : null
  const finalTotal = activeDiscount ? activeDiscount.finalAmount : total

  const endTime = draft.slot ? addMinutes(draft.slot, draft.durationMin) : ""

  // Court step — only narrow the court list when a room is linked (so the
  // finder still browses the whole catalog otherwise).
  const linkedRoom = roomId ? sessions.find((s) => s.id === roomId) : undefined
  const eligibleCourts = linkedRoom
    ? COURTS.filter((c) => c.sports.includes(linkedRoom.sport))
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
      ? eligibleCourts.some((c) => c.id === courtId)
      : stepName === "slot"
        ? Boolean(draft.slot) && !draftConflict
        : true

  // Pay step — transfer via QR is the only method, so paying is always ready.
  const canPay = !paying

  // Until the effect above arms a fresh booking, there's nothing to show.
  if (!open) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "player-play min-h-full text-foreground",
        stepName === "court" ? "bg-[#f6f9ff]" : "bg-white"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col",
          stepName === "court"
            ? "max-w-[1800px] gap-4 px-4 py-5 sm:px-6 lg:px-7"
            : "max-w-6xl gap-6 px-5 pt-8 pb-24 sm:px-8 sm:pb-10"
        )}
      >
        {/* Page header — title + copy, with the court search over the list column */}
        <header className="grid shrink-0 items-center gap-3 lg:grid-cols-[260px_minmax(0,1fr)_minmax(340px,0.9fr)] lg:gap-4">
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1 lg:col-span-2",
              stepName === "court" && "sm:flex-row sm:items-center sm:gap-8"
            )}
          >
            <h1
              className={cn(
                "font-heading text-2xl font-black tracking-tight sm:text-3xl",
                stepName === "court" ? "text-[#0b1224]" : "text-brand"
              )}
            >
              {t("title")}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {stepName === "court" ? t("subtitle") : t("slotSubtitle")}
            </p>
          </div>
          {stepName === "court" ? (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("courtSearch")}
                aria-label={t("courtSearch")}
                className="h-11 rounded-xl border-[#e3eafa] bg-white pr-10 pl-10 text-xs shadow-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={tf("clearSearch")}
                  className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* Back + stepper — lime-ringed numbered steps on a lime rail */}
        <div className="flex items-center gap-3 sm:gap-5">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full text-brand"
            onClick={closeBooking}
            disabled={paying}
            aria-label={t("close")}
          >
            <ArrowLeft />
          </Button>
          <div className="flex flex-1 items-center gap-2 sm:gap-3">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <span className="inline-flex shrink-0 items-center gap-2.5 text-sm font-semibold text-brand">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full border-2 border-lime text-base font-bold tabular-nums sm:size-10 sm:text-lg",
                      i === step
                        ? "bg-lime text-lime-foreground"
                        : "bg-white text-brand"
                    )}
                  >
                    {i < step ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{t(`steps.${s}`)}</span>
                </span>
                {i < steps.length - 1 ? (
                  <span className="h-0.5 min-w-4 flex-1 bg-lime" />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content — one card per step; the slot step splits into two */}
        <div
          className={cn(
            "flex w-full flex-col",
            stepName !== "court" &&
              stepName !== "slot" &&
              "rounded-3xl border border-[#eaf0fc] bg-white p-4 shadow-[0_3px_16px_#14205006] sm:p-6"
          )}
        >
          {/* COURT — finder: filters + map + list */}
          {stepName === "court" ? (
            <CourtFinder
              courts={eligibleCourts}
              query={query}
              selectedId={courtId}
              onSelect={setCourt}
              onChoose={(id, dayKey) => {
                setCourt(id)
                // A day picked in the finder's time filter opens the calendar there.
                if (dayKey) setDay(dayKey)
                next()
              }}
            />
          ) : null}

          {/* SLOT — court × hour grid of the court's venue */}
          {stepName === "slot" && courtId ? (
            <div className="flex w-full flex-col gap-6">
              <CourtSlotGrid
                courts={eligibleCourts}
                courtId={courtId}
                dayKey={draft.dayKey}
                slot={draft.slot}
                durationMin={draft.durationMin}
                onDay={setDay}
                onPick={(id, start, dur) => {
                  if (id !== courtId) setCourt(id)
                  pickSlot(start, dur)
                }}
              />

              {draftConflict ? (
                <p className="inline-flex items-center gap-1.5 self-end text-sm font-medium text-destructive">
                  <TriangleAlert className="size-4 shrink-0" />
                  {draftConflict === "self-overlap"
                    ? t("conflictSelf")
                    : t("conflictCourt")}
                </p>
              ) : null}

              <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:items-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                <div className="flex items-baseline justify-between gap-x-5 gap-y-1 text-brand sm:justify-end">
                  {[
                    { label: t("startTime"), value: draft.slot },
                    { label: t("endTime"), value: endTime },
                  ].map(({ label, value }) => (
                    <span
                      key={label}
                      className="inline-flex items-baseline gap-2"
                    >
                      <span className="text-xs font-semibold sm:text-sm">
                        {label}
                      </span>
                      <span className="font-mono text-xl font-bold text-[#0b1224] tabular-nums sm:text-2xl">
                        {value || t("grid.none")}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  {step > 0 ? (
                    <Button
                      variant="outline"
                      className="h-10 rounded-full border-brand px-5 text-brand"
                      onClick={back}
                    >
                      {t("back")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button
                    className="h-10 rounded-full bg-lime px-7 font-semibold text-lime-foreground hover:bg-lime/90"
                    disabled={!canNext}
                    onClick={next}
                  >
                    {t("grid.confirm")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* CONFIRM */}
          {stepName === "confirm" && court && draft.slot ? (
            <div className="flex w-full flex-col gap-6">
              {holdCountdown ? <HoldBadge time={holdCountdown} t={t} /> : null}

              <div className="grid w-full gap-x-12 gap-y-8 lg:grid-cols-2">
                {/* Booking details */}
                <div className="flex flex-col gap-3.5">
                  <p className="font-heading text-lg leading-tight font-semibold">
                    {t("summary")}
                  </p>
                  {[
                    {
                      label: t("where"),
                      value: `${court.ward} · ${court.distanceKm != null ? t("distance", { km: court.distanceKm }) : ts("distanceUnknown")}`,
                    },
                    {
                      label: t("when"),
                      value: `${locStr(dayLabelFor(draft.dayKey), locale)} · ${slotRange(draft.slot, draft.durationMin)}`,
                    },
                    {
                      label: t("durationLabel"),
                      value: formatDuration(draft.durationMin),
                    },
                    { label: t("players"), value: playersLine },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 text-base"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right font-medium">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Price */}
                <div className="flex flex-col gap-4 lg:border-l lg:border-border lg:pl-12">
                  <PriceBreakdown
                    subtotal={total}
                    finalTotal={finalTotal}
                    appliedDiscount={activeDiscount}
                    t={t}
                  />

                  {conflict ? (
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive">
                      <TriangleAlert className="size-4 shrink-0" />
                      {conflict === "self-overlap"
                        ? t("conflictSelf")
                        : t("conflictCourt")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* PAY — real SePay checkout (a redirect); no card/QR entry in-app */}
          {stepName === "pay" && court && draft.slot ? (
            <div className="flex w-full flex-col gap-6">
              {holdCountdown ? <HoldBadge time={holdCountdown} t={t} /> : null}

              <div className="grid w-full gap-x-12 gap-y-8 lg:grid-cols-2">
                {/* LEFT — booking summary + total */}
                <div className="flex flex-col gap-4">
                  {/* Where + when */}
                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-center justify-between gap-3 text-base">
                      <span className="text-muted-foreground">
                        {t("where")}
                      </span>
                      <span className="text-right font-medium">
                        {court.ward} ·{" "}
                        {court.distanceKm != null
                          ? t("distance", { km: court.distanceKm })
                          : ts("distanceUnknown")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-base">
                      <span className="text-muted-foreground">{t("when")}</span>
                      <span className="text-right font-medium">
                        {locStr(dayLabelFor(draft.dayKey), locale)} ·{" "}
                        {slotRange(draft.slot, draft.durationMin)}
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Price breakdown */}
                  <PriceBreakdown
                    subtotal={total}
                    finalTotal={finalTotal}
                    appliedDiscount={activeDiscount}
                    onRemoveDiscount={removeDiscount}
                    removable
                    t={t}
                  />
                </div>

                {/* RIGHT — discount + checkout */}
                <div className="flex flex-col gap-5 lg:border-l lg:border-border lg:pl-12">
                  {/* Discount code */}
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("pay.discountLabel")}</Label>
                    {activeDiscount ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/8 px-3.5 py-2.5 ring-1 ring-brand/15">
                        <p className="inline-flex items-center gap-1.5 text-sm text-brand">
                          <Check className="size-4 shrink-0" />
                          {activeDiscount.description}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Input
                            value={discountInput}
                            onChange={(e) => {
                              setDiscountInput(e.target.value.toUpperCase())
                              setDiscountError(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                void applyDiscount()
                              }
                            }}
                            placeholder={t("pay.discountPlaceholder")}
                            aria-label={t("pay.discountLabel")}
                            disabled={paying || discountLoading}
                            className="h-9 flex-1 font-mono tracking-wider uppercase"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 shrink-0 rounded-full"
                            disabled={
                              !discountInput.trim() || paying || discountLoading
                            }
                            onClick={() => void applyDiscount()}
                          >
                            {discountLoading ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              t("pay.applyDiscount")
                            )}
                          </Button>
                        </div>
                        {discountError ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                            <TriangleAlert className="size-3.5 shrink-0" />
                            {discountError}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* SePay hosts the actual checkout (VietQR/card) — this button
                  submits a hidden, HMAC-signed form there (see session.tsx#pay). */}
                  <div className="flex flex-col items-center gap-3 rounded-3xl bg-muted/40 px-4 py-5 text-center">
                    <div className="grid size-14 place-items-center rounded-full bg-brand/10 text-brand">
                      <ShieldCheck className="size-6" />
                    </div>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {t("pay.redirectNotice")}
                    </p>
                  </div>

                  {checkoutError ? (
                    <div className="flex items-center gap-2.5 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                      <TriangleAlert className="size-4 shrink-0" />
                      <span>{checkoutError}</span>
                    </div>
                  ) : null}

                  <p className="text-center text-xs text-muted-foreground">
                    {t("pay.refundPolicy")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Action bar — fixed to the viewport on phones (not sticky-in-scroll-
          container, which drifts with the dashboard's own scroll padding) so
          the primary action always stays reachable at the true screen edge.
          The court step has none: each card's "Đặt sân" advances instead. */}
        {stepName !== "court" && stepName !== "slot" ? (
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            {step > 0 ? (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  if (stepName === "pay") clearCheckoutError()
                  back()
                }}
                disabled={
                  paying ||
                  Boolean(sessions.find((s) => s.id === roomId)?.reservationId)
                }
              >
                {t("back")}
              </Button>
            ) : (
              <span />
            )}
            {stepName === "pay" ? (
              <Button
                className="h-11 rounded-full px-5 text-base"
                disabled={!canPay}
                onClick={() => pay(activeDiscount?.code)}
              >
                {paying ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {t("pay.processing")}
                  </>
                ) : (
                  <>
                    <Lock />
                    {t("pay.payNow", {
                      amount: court ? formatVnd(finalTotal) : "",
                    })}
                  </>
                )}
              </Button>
            ) : stepName === "confirm" ? (
              <Button
                className="h-11 rounded-full px-5 text-base"
                disabled={Boolean(conflict) || !court || !draft.slot}
                onClick={next}
              >
                {t("toPayment")}
              </Button>
            ) : (
              <Button
                className="h-11 rounded-full px-5 text-base"
                disabled={!canNext}
                onClick={next}
              >
                {t("next")}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The branch a court belongs to: its catalog name minus the " · {court}" suffix. */
function venueKeyOf(court: Court): string {
  const suffix = court.courtName ? ` · ${court.courtName}` : ""
  return suffix && court.name.endsWith(suffix)
    ? court.name.slice(0, -suffix.length)
    : court.name
}

type CellState = "free" | "mine" | "busy" | "closed"

const CELL_CLASS: Record<CellState, string> = {
  free: "border-brand bg-white hover:bg-brand/10 cursor-pointer",
  mine: "border-brand bg-brand cursor-pointer",
  busy: "border-brand bg-[#ff6fcf] cursor-not-allowed",
  closed: "border-[#d5dbe8] bg-[#f1f3f5] cursor-not-allowed",
}

/**
 * The slot step: every court of the chosen court's branch as a column, one
 * row per hour of the open window. Free cells pick an hour; tapping another
 * free hour on the same court stretches the selection across the free run in
 * between, and a tap on another court starts over there (switching court).
 */
function CourtSlotGrid({
  courts,
  courtId,
  dayKey,
  slot,
  durationMin,
  onDay,
  onPick,
}: {
  courts: Court[]
  courtId: string
  dayKey: string
  slot: string | null
  durationMin: number
  onDay: (dayKey: string) => void
  onPick: (courtId: string, start: string, durationMin: number) => void
}) {
  const t = useTranslations("Booking")
  const { courtDayBusy, courtDayGaps, todayIso, bookingDays } = useData()
  const { sessions, roomId } = useBooking()

  const current = courts.find((c) => c.id === courtId)
  const group = React.useMemo(() => {
    if (!current) return []
    const key = venueKeyOf(current)
    return courts
      .filter((c) => venueKeyOf(c) === key)
      .sort((a, b) =>
        (a.courtName ?? a.name).localeCompare(b.courtName ?? b.name, "vi", {
          numeric: true,
        })
      )
  }, [courts, current])

  const hours = React.useMemo(() => {
    const out: number[] = []
    for (
      let m = toMin(COURT_OPEN_FROM);
      m + 60 <= toMin(COURT_OPEN_TO);
      m += 60
    )
      out.push(m)
    return out
  }, [])

  const ignore = roomId ?? undefined
  const bands = new Map(
    group.map((c) => [
      c.id,
      {
        busy: courtDayBusy(sessions, c.id, dayKey, ignore),
        gaps: courtDayGaps(sessions, c.id, dayKey, ignore),
      },
    ])
  )

  const isFree = (cid: string, h: number) =>
    (bands.get(cid)?.gaps ?? []).some(
      (g) => toMin(g.start) <= h && toMin(g.start) + g.durationMin >= h + 60
    )
  const allFree = (cid: string, from: number, to: number) => {
    for (let h = from; h < to; h += 60) if (!isFree(cid, h)) return false
    return true
  }

  const selStart = slot ? toMin(slot) : null
  const selEnd = selStart != null ? selStart + durationMin : null

  const stateOf = (cid: string, h: number): CellState => {
    if (
      cid === courtId &&
      selStart != null &&
      selEnd != null &&
      h < selEnd &&
      h + 60 > selStart
    )
      return "mine"
    if (isFree(cid, h)) return "free"
    const busy = (bands.get(cid)?.busy ?? []).some(
      (b) => toMin(b.start) < h + 60 && toMin(b.start) + b.durationMin > h
    )
    return busy ? "busy" : "closed"
  }

  const tap = (cid: string, h: number) => {
    const at = (m: number) => addMinutes("00:00", m)
    if (cid === courtId && selStart != null && selEnd != null) {
      // Extend forward / backward across a fully free run.
      if (h >= selEnd && allFree(cid, selEnd, h + 60))
        return onPick(cid, at(selStart), h + 60 - selStart)
      if (h < selStart && allFree(cid, h, selStart))
        return onPick(cid, at(h), selEnd - h)
      // Inside the selection: trim an edge hour, or collapse to this hour.
      if (h >= selStart && h < selEnd && selEnd - selStart > 60) {
        if (h === selStart) return onPick(cid, at(h + 60), selEnd - h - 60)
        if (h + 60 >= selEnd) return onPick(cid, at(selStart), h - selStart)
      }
    }
    if (isFree(cid, h) || cid === courtId) onPick(cid, at(h), 60)
  }

  const lastDay = bookingDays[bookingDays.length - 1]?.key ?? todayIso
  const weekdays = t.raw("grid.weekdays") as string[]
  const [y, m, d] = dayKey.split("-")
  const cols = `4.5rem repeat(${group.length}, minmax(5.5rem, 1fr))`

  const legend = (
    <div className="flex items-start gap-4 text-[10px] font-semibold text-[#0b1224] sm:gap-6">
      {(["free", "mine", "busy"] as const).map((k) => (
        <span key={k} className="flex flex-col items-center gap-1.5">
          <span className={cn("h-5 w-9 rounded-sm border-2", CELL_CLASS[k])} />
          {t(`grid.${k}`)}
        </span>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Day navigation + legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 sm:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onDay(addDays(dayKey, -1))}
            disabled={dayKey <= todayIso}
            aria-label={t("grid.prevDay")}
            className="grid size-9 place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => onDay(todayIso)}
            className="h-9 rounded-full border-2 border-lime px-5 text-sm font-semibold text-brand transition-colors hover:bg-lime/30"
          >
            {t("grid.today")}
          </button>
          <button
            type="button"
            onClick={() => onDay(addDays(dayKey, 1))}
            disabled={dayKey >= lastDay}
            aria-label={t("grid.nextDay")}
            className="grid size-9 place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="ml-1 flex flex-col">
            <span className="text-lg leading-tight font-bold text-[#0b1224]">
              {weekdays[mondayIndex(dayKey)]}
            </span>
            <span className="font-mono text-[10px] font-semibold text-[#0b1224] tabular-nums">
              {d}/{m}/{y}
            </span>
          </div>
        </div>
        {legend}
      </div>

      {/* Court × hour grid */}
      <div className="rounded-2xl border-2 border-brand bg-white p-3 sm:p-4">
        <div className="max-h-[min(60vh,32rem)] overflow-auto pr-1">
          <div
            className="grid min-w-max gap-x-3 gap-y-2"
            style={{ gridTemplateColumns: cols }}
          >
            {/* Header bar */}
            <div
              className="sticky top-0 z-10 col-span-full grid items-center gap-x-3 rounded-xl bg-brand py-2.5 text-white"
              style={{ gridTemplateColumns: cols }}
            >
              <span />
              {group.map((c) => (
                <span
                  key={c.id}
                  className="truncate px-1 text-center text-sm font-bold sm:text-base"
                  title={c.name}
                >
                  {c.courtName ?? c.name}
                </span>
              ))}
            </div>

            {hours.map((h) => (
              <React.Fragment key={h}>
                <span className="sticky left-0 z-[5] self-center bg-white pl-2 font-mono text-sm font-bold text-[#0b1224] tabular-nums sm:text-base">
                  {addMinutes("00:00", h)}
                </span>
                {group.map((c) => {
                  const state = stateOf(c.id, h)
                  const time = addMinutes("00:00", h)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={state === "busy" || state === "closed"}
                      aria-pressed={state === "mine"}
                      aria-label={`${t("grid.cell", {
                        court: c.courtName ?? c.name,
                        time,
                      })} — ${t(`grid.${state === "closed" ? "busy" : state}`)}`}
                      onClick={() => tap(c.id, h)}
                      className={cn(
                        "h-9 w-full rounded-sm border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        CELL_CLASS[state]
                      )}
                    />
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Open Google Maps driving directions to a court in a new tab. */
function openDirections(court: Court) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/** Lower-case and strip diacritics so search ignores case and accents. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

type SortKey = "distance" | "price" | "rating"
const SORTS: SortKey[] = ["distance", "price", "rating"]
const COMPARE: Record<SortKey, (a: Court, b: Court) => number> = {
  distance: compareDistance,
  price: (a, b) => a.pricePerHour - b.pricePerHour,
  rating: (a, b) => b.rating - a.rating,
}

type Period = "all" | "morning" | "afternoon" | "evening"
const PERIODS: Period[] = ["all", "morning", "afternoon", "evening"]
/** Time-of-day windows, in minutes from midnight, within the open hours. */
const PERIOD_WINDOW: Record<Period, readonly [number, number]> = {
  all: [toMin(COURT_OPEN_FROM), toMin(COURT_OPEN_TO)],
  morning: [toMin(COURT_OPEN_FROM), 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, toMin(COURT_OPEN_TO)],
}
/** A court only counts as free in a window if a full hour fits there. */
const MIN_FREE_MIN = 60

const PRICE_STEP = 10_000

interface FinderFilters {
  province: string
  ward: string
  distance: number | null
  price: readonly [number, number]
  /** A bookable day key, or "" for any day. */
  day: string
  period: Period
  surfaces: string[]
}

/** Filter-panel label: small icon + semibold caption. */
function FilterLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </span>
  )
}

/**
 * Two-thumb price slider over a shared track. Each thumb is a native range
 * input (keyboard + a11y for free); only the thumbs take pointer events so the
 * overlapping inputs don't steal each other's drags.
 */
function PriceRange({
  bounds,
  value,
  onChange,
  minLabel,
  maxLabel,
}: {
  bounds: readonly [number, number]
  value: readonly [number, number]
  onChange: (v: [number, number]) => void
  minLabel: string
  maxLabel: string
}) {
  const [lo, hi] = value
  const span = Math.max(1, bounds[1] - bounds[0])
  const pct = (v: number) => ((v - bounds[0]) / span) * 100
  const thumb =
    "pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-3 [&:focus-visible::-webkit-slider-thumb]:ring-brand/30"

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#e3eafa]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={bounds[0]}
          max={bounds[1]}
          step={PRICE_STEP}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          aria-label={minLabel}
          className={thumb}
        />
        <input
          type="range"
          min={bounds[0]}
          max={bounds[1]}
          step={PRICE_STEP}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          aria-label={maxLabel}
          className={thumb}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{formatVnd(bounds[0])}</span>
        <span>{formatVnd(bounds[1])}+</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Input
          type="number"
          min={bounds[0]}
          max={hi}
          step={PRICE_STEP}
          value={lo}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange([Math.min(v, hi), hi])
          }}
          aria-label={minLabel}
          className="h-10 rounded-xl border-[#e3eafa] bg-white text-xs tabular-nums"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          min={lo}
          max={bounds[1]}
          step={PRICE_STEP}
          value={hi}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange([lo, Math.max(v, lo)])
          }}
          aria-label={maxLabel}
          className="h-10 rounded-xl border-[#e3eafa] bg-white text-xs tabular-nums"
        />
      </div>
    </div>
  )
}

/** "Danh sách | Bản đồ" switch — floats on the map, or heads the list view. */
function ViewToggle({
  value,
  onChange,
}: {
  value: "map" | "list"
  onChange: (v: "map" | "list") => void
}) {
  const t = useTranslations("Booking")
  return (
    <div className="inline-flex rounded-xl bg-white p-1 shadow-md ring-1 ring-black/5">
      {(
        [
          { v: "list", icon: List },
          { v: "map", icon: MapIcon },
        ] as const
      ).map(({ v, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            value === v
              ? "bg-brand text-brand-foreground"
              : "text-[#142050] hover:bg-[#f4f7fc]"
          )}
        >
          <Icon className="size-3.5" />
          {t(`view.${v}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * The court-finder step of the booking wizard — a filter panel, a map and a
 * court list, matching the book/play mockup. The panel's filters are drafted
 * and applied with "Tìm sân"; the header search and sort apply live. Choosing
 * a court (map pin or list card) selects it; "Đặt sân" advances to the slot
 * step, carrying the filtered day over as the booking day.
 */
function CourtFinder({
  courts,
  query,
  selectedId,
  onSelect,
  onChoose,
}: {
  courts: Court[]
  query: string
  selectedId: string | null
  onSelect: (id: string) => void
  onChoose: (id: string, dayKey: string | null) => void
}) {
  const t = useTranslations("Booking")
  const tf = useTranslations("FindCourts")
  const locale = useLocale()
  const {
    venuePins,
    userLoc,
    geoStatus,
    requestLocation,
    bookingDays,
    courtDayGaps,
    dayLabelFor,
  } = useData()
  const { sessions, roomId } = useBooking()

  const priceBounds = React.useMemo((): readonly [number, number] => {
    if (!courts.length) return [0, 0]
    const prices = courts.map((c) => c.pricePerHour)
    return [
      Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP,
      Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP,
    ]
  }, [courts])

  const defaults: FinderFilters = {
    province: "all",
    ward: "all",
    distance: null,
    price: priceBounds,
    day: "",
    period: "all",
    surfaces: [],
  }
  // `draft` is what the panel shows; `applied` is what filters the results.
  const [draft, setDraft] = React.useState<FinderFilters>(defaults)
  const [applied, setApplied] = React.useState<FinderFilters>(defaults)
  const patch = (p: Partial<FinderFilters>) => setDraft((d) => ({ ...d, ...p }))

  const [sort, setSort] = React.useState<SortKey>("distance")
  const [view, setView] = React.useState<"map" | "list">("map")

  const provinces = React.useMemo(
    () =>
      Array.from(new Set(courts.map((c) => c.province).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "vi")
      ),
    [courts]
  )
  const wards = React.useMemo(
    () =>
      Array.from(
        new Set(
          courts
            .filter(
              (c) => draft.province === "all" || c.province === draft.province
            )
            .map((c) => c.ward)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [courts, draft.province]
  )
  const surfaces = React.useMemo(
    () =>
      Array.from(new Set(courts.map((c) => c.surface).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "vi")
      ),
    [courts]
  )

  const results = React.useMemo(() => {
    const q = normalize(query)
    const f = applied
    const [winStart, winEnd] = PERIOD_WINDOW[f.period]
    const filterTime = Boolean(f.day) || f.period !== "all"
    // No specific day but a time of day → judge availability by today.
    const day = f.day || bookingDays[0]?.key
    return courts
      .filter((c) => {
        if (f.province !== "all" && c.province !== f.province) return false
        if (f.ward !== "all" && c.ward !== f.ward) return false
        // An unknown distance can't be proven within the radius.
        if (
          f.distance != null &&
          (c.distanceKm == null || c.distanceKm > f.distance)
        )
          return false
        if (c.pricePerHour < f.price[0] || c.pricePerHour > f.price[1])
          return false
        if (f.surfaces.length && !f.surfaces.includes(c.surface)) return false
        if (q && !normalize([c.name, c.ward, c.province].join(" ")).includes(q))
          return false
        if (filterTime && day) {
          const fits = courtDayGaps(
            sessions,
            c.id,
            day,
            roomId ?? undefined
          ).some((g) => {
            const start = toMin(g.start)
            const end = start + g.durationMin
            return (
              Math.min(end, winEnd) - Math.max(start, winStart) >= MIN_FREE_MIN
            )
          })
          if (!fits) return false
        }
        return true
      })
      .sort(COMPARE[sort])
  }, [
    courts,
    query,
    applied,
    sort,
    bookingDays,
    courtDayGaps,
    sessions,
    roomId,
  ])

  const mapCourts = React.useMemo(
    () => results.filter(hasCoordinates),
    [results]
  )
  const mapVenues = React.useMemo(
    () => venuePins.filter(hasCoordinates),
    [venuePins]
  )

  const nearMe = () => {
    setSort("distance")
    void requestLocation()
  }

  return (
    <div className="grid gap-4 lg:h-[clamp(34rem,calc(100svh-15.5rem),56rem)] lg:grid-cols-[260px_minmax(0,1fr)_minmax(340px,0.9fr)]">
      {/* Filters */}
      <aside className="flex flex-col gap-5 rounded-3xl border border-[#eaf0fc] bg-white p-4 shadow-[0_3px_16px_#14205008] lg:min-h-0 lg:overflow-y-auto">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[#f4f7fc] p-1">
          <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-brand-foreground shadow-sm">
            <MapPin className="size-4" />
            {t("tabCourts")}
          </span>
          <Link
            href="/app/play?tab=rooms"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Users className="size-4" />
            {t("tabRooms")}
          </Link>
        </div>

        {/* Area */}
        <div className="flex flex-col gap-2">
          <FilterLabel icon={MapPin}>{t("filter.area")}</FilterLabel>
          <Select
            value={draft.province}
            onValueChange={(v) => {
              if (v) patch({ province: v, ward: "all" })
            }}
          >
            <SelectTrigger
              aria-label={t("filter.province")}
              className="h-10 w-full rounded-xl border-[#e3eafa] bg-white text-xs"
            >
              <SelectValue>
                {draft.province === "all"
                  ? t("filter.allProvinces")
                  : draft.province}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="player-play-overlay rounded-xl">
              <SelectItem value="all">{t("filter.allProvinces")}</SelectItem>
              {provinces.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.ward}
            onValueChange={(v) => {
              if (v) patch({ ward: v })
            }}
          >
            <SelectTrigger
              aria-label={t("filter.ward")}
              className={cn(
                "h-10 w-full rounded-xl border-[#e3eafa] bg-white text-xs",
                draft.ward === "all" && "text-muted-foreground"
              )}
            >
              <SelectValue>
                {draft.ward === "all" ? t("filter.ward") : draft.ward}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="player-play-overlay rounded-xl">
              <SelectItem value="all">{t("filter.ward")}</SelectItem>
              {wards.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Distance */}
        <div className="flex flex-col gap-2">
          <FilterLabel icon={Radar}>{t("filter.distance")}</FilterLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {([1, 3, 5, 10] as const).map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={draft.distance === km}
                // Tapping the active radius clears it back to "any".
                onClick={() =>
                  patch({ distance: draft.distance === km ? null : km })
                }
                className={cn(
                  "h-9 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  draft.distance === km
                    ? "bg-brand text-brand-foreground"
                    : "bg-[#f4f7fc] text-[#142050] hover:bg-[#e9effb]"
                )}
              >
                {km} km
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        <div className="flex flex-col gap-2">
          <FilterLabel icon={Tag}>{t("filter.price")}</FilterLabel>
          <PriceRange
            bounds={priceBounds}
            value={draft.price}
            onChange={(price) => patch({ price })}
            minLabel={t("filter.minPrice")}
            maxLabel={t("filter.maxPrice")}
          />
        </div>

        {/* Time */}
        <div className="flex flex-col gap-2">
          <FilterLabel icon={CalendarDays}>{t("filter.time")}</FilterLabel>
          <Select
            value={draft.day || "any"}
            onValueChange={(v) => {
              if (v) patch({ day: v === "any" ? "" : v })
            }}
          >
            <SelectTrigger
              aria-label={t("filter.time")}
              className="h-10 w-full rounded-xl border-[#e3eafa] bg-white text-xs"
            >
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <SelectValue>
                  {draft.day
                    ? locStr(dayLabelFor(draft.day), locale)
                    : t("filter.anyDay")}
                </SelectValue>
              </span>
            </SelectTrigger>
            <SelectContent className="player-play-overlay rounded-xl">
              <SelectItem value="any">{t("filter.anyDay")}</SelectItem>
              {bookingDays.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {locStr(d.label, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.period}
            onValueChange={(v) => {
              if (v) patch({ period: v })
            }}
          >
            <SelectTrigger
              aria-label={t("filter.time")}
              className="h-10 w-full rounded-xl border-[#e3eafa] bg-white text-xs"
            >
              <span className="inline-flex items-center gap-2">
                <Clock className="size-3.5 text-muted-foreground" />
                <SelectValue>{t(`filter.period.${draft.period}`)}</SelectValue>
              </span>
            </SelectTrigger>
            <SelectContent className="player-play-overlay rounded-xl">
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`filter.period.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Surface */}
        {surfaces.length ? (
          <div className="flex flex-col gap-2">
            <FilterLabel icon={Layers}>{t("filter.surface")}</FilterLabel>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {surfaces.map((s) => (
                <label
                  key={s}
                  className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-[#142050]"
                >
                  <input
                    type="checkbox"
                    checked={draft.surfaces.includes(s)}
                    onChange={(e) =>
                      patch({
                        surfaces: e.target.checked
                          ? [...draft.surfaces, s]
                          : draft.surfaces.filter((x) => x !== s),
                      })
                    }
                    className="size-4 shrink-0 rounded accent-[#2046ed]"
                  />
                  <span className="truncate">{s}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Button
            className="h-12 rounded-full text-base font-semibold"
            onClick={() => setApplied(draft)}
          >
            <Search />
            {t("filter.apply")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setDraft(defaults)
              setApplied(defaults)
            }}
            className="self-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("filter.reset")}
          </button>
        </div>
      </aside>

      {/* Map */}
      {view === "map" ? (
        <div className="relative h-[340px] overflow-hidden rounded-3xl bg-secondary ring-1 ring-[#e3eafa] lg:h-full">
          <CourtMap
            blueMarkers
            courts={mapCourts}
            venues={mapVenues}
            selectedId={selectedId}
            onSelect={onSelect}
            userLoc={userLoc}
          />
          <div className="absolute top-3 left-3 z-10">
            <ViewToggle value={view} onChange={setView} />
          </div>
          <button
            type="button"
            onClick={nearMe}
            disabled={geoStatus === "locating"}
            className="absolute right-3 bottom-3 z-10 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/95 px-3.5 py-2 text-xs font-semibold text-[#142050] shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-80"
          >
            {geoStatus === "locating" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : geoStatus === "on" ? (
              <LocateFixed className="size-4 text-brand" />
            ) : (
              <Locate className="size-4" />
            )}
            {geoStatus === "locating" ? t("locating") : t("nearMe")}
          </button>
        </div>
      ) : null}

      {/* List */}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0",
          view === "list" && "lg:col-span-2"
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {view === "list" ? (
              <ViewToggle value={view} onChange={setView} />
            ) : null}
            <p className="text-sm font-semibold text-[#142050]">
              {tf("nearby", { count: results.length })}
            </p>
          </div>
          <Select
            value={sort}
            onValueChange={(v) => {
              if (v) setSort(v)
            }}
          >
            <SelectTrigger
              aria-label={tf("sortBy")}
              className="h-9 rounded-xl border-[#e3eafa] bg-white text-xs shadow-sm"
            >
              <SelectValue>
                {t("sortLabel", { sort: t(`sort.${sort}`) })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="end"
              className="player-play-overlay rounded-xl"
            >
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sort.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className={cn(
            "no-scrollbar grid content-start gap-3 p-1 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto",
            view === "list" && "xl:grid-cols-2"
          )}
        >
          {results.map((c) => (
            <FinderCourtCard
              key={c.id}
              court={c}
              selected={c.id === selectedId}
              onSelect={() => onSelect(c.id)}
              onChoose={() => onChoose(c.id, applied.day || null)}
            />
          ))}
          {!results.length ? (
            <p className="rounded-3xl border border-dashed border-border bg-white px-4 py-16 text-center text-sm text-muted-foreground">
              {t("noCourts")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** One court in the finder list — photo, rating, location, availability, price. */
function FinderCourtCard({
  court,
  selected,
  onSelect,
  onChoose,
}: {
  court: Court
  selected: boolean
  onSelect: () => void
  onChoose: () => void
}) {
  const t = useTranslations("Booking")
  const tf = useTranslations("FindCourts")
  const tc = useTranslations("Common")
  const ts = useTranslations("Shared")

  return (
    <div
      className={cn(
        "relative rounded-3xl border bg-white p-3.5 shadow-[0_4px_20px_#1420500a] transition-shadow hover:shadow-md",
        selected ? "border-brand ring-2 ring-brand" : "border-[#eaf0fc]"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={court.name}
        className="absolute inset-0 z-0 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <div className="pointer-events-none relative z-10 flex gap-4">
        <CourtImage
          court={court}
          className="h-[84px] w-[104px] shrink-0 rounded-2xl sm:h-[92px] sm:w-[124px]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-heading text-base leading-snug font-bold text-[#0b1224]">
              {court.name}
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {court.rating}
            </span>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <MapPin className="mt-px size-3 shrink-0" />
            {[court.ward, court.province].filter(Boolean).join(", ")}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Navigation className="size-3 shrink-0" />
            {court.distanceKm != null
              ? t("distance", { km: court.distanceKm })
              : ts("distanceUnknown")}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#142050]">
            {court.sports.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {tc(`sports.${s}`)}
              </span>
            ))}
            {court.surface ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Layers className="size-3" />
                {court.surface}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="flex items-baseline gap-0.5">
            <span className="font-heading text-lg leading-none font-black text-[#0b1224] tabular-nums">
              {formatVnd(court.pricePerHour)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t("perHour")}
            </span>
          </span>
          <span className="rounded-full bg-[#f4f7fc] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            {tf("openSlots", { count: court.openSlots })}
          </span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            size="sm"
            className="h-10 rounded-full bg-lime px-5 text-xs font-semibold text-lime-foreground hover:bg-lime/90"
            onClick={onChoose}
          >
            {tf("book")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 rounded-full border-[#e3eafa] px-3.5 text-xs"
            onClick={() => openDirections(court)}
            disabled={!hasCoordinates(court)}
          >
            <Navigation className="size-3.5" />
            <span>{tf("directions")}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
