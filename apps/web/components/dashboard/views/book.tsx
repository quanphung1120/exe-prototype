"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Star,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LevelChip, PlayerAvatar } from "@/components/dashboard/shared"
import {
  BOOKING_DAYS,
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
  type CourtBand,
  type SportKey,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useBooking, type FillMode } from "@/components/dashboard/booking"

/** Faked payment methods offered on the Pay step. */
type PayMethod = "qr" | "card" | "ewallet"
type WalletKey = "momo" | "zalopay"

/** E-wallet options (decorative — brand-tinted monogram + label). */
const WALLETS: { key: WalletKey; letter: string; color: string }[] = [
  { key: "momo", letter: "M", color: "bg-pink-600" },
  { key: "zalopay", letter: "Z", color: "bg-blue-600" },
]

/** Shared surface styling for each step's card(s). */
const CARD =
  "rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:p-6 dark:ring-foreground/10"
/** Comfortable reading width for the form-like steps (court, players, …). */
const FORM_CARD = cn(CARD, "mx-auto flex w-full max-w-2xl flex-col gap-4")

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
    capacityFor,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setDuration,
    pickSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    courtBusy,
    courtGaps,
    paying,
    pay,
  } = useBooking()
  const {
    courts: COURTS,
    players: MATCH_SUGGESTIONS,
    user: USER,
    playerByInitials,
  } = useData()

  // Cold load / direct navigation: nothing armed the wizard, so default to a
  // fresh, courtless booking instead of rendering a stale draft.
  React.useEffect(() => {
    if (!open) armBooking(null, { fillMode: "court" })
  }, [open, armBooking])

  const [courtQuery, setCourtQuery] = React.useState("")

  // Payment screen — purely cosmetic local state (like the court search box).
  const [method, setMethod] = React.useState<PayMethod>("qr")
  const [card, setCard] = React.useState("")
  const [exp, setExp] = React.useState("")
  const [cvc, setCvc] = React.useState("")
  const [cardName, setCardName] = React.useState(USER.name)
  const [wallet, setWallet] = React.useState<WalletKey>("momo")

  const stepName = steps[step]
  const sport = court?.sports[0]

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

  // Players step
  const maxInvites = capacityFor(draft.format) - 1
  const invitable = sport
    ? [...MATCH_SUGGESTIONS]
        .filter((p) => p.initials !== USER.initials)
        .sort(
          (a, b) => (a.sport === sport ? 0 : 1) - (b.sport === sport ? 0 : 1)
        )
    : MATCH_SUGGESTIONS

  // Confirm step — the typed reason (court-taken / self-overlap) or null.
  const conflict = draftConflict
  const headCount =
    draft.fillMode === "find" && !roomId
      ? capacityFor(draft.format)
      : 1 + draft.invitees.length
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

  // Pay step — light formatting so the inputs feel real (all cosmetic).
  const onCard = (v: string) =>
    setCard(
      v
        .replace(/\D/g, "")
        .slice(0, 16)
        .replace(/(.{4})/g, "$1 ")
        .trim()
    )
  const onExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4)
    setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
  }
  const onCvc = (v: string) => setCvc(v.replace(/\D/g, "").slice(0, 4))

  // The card path asks for a full card; QR / e-wallet are one-tap.
  const cardReady =
    card.replace(/\s/g, "").length >= 16 && exp.length >= 4 && cvc.length >= 3
  const canPay = !paying && (method !== "card" || cardReady)
  const perHead = court
    ? formatVnd(Math.round(total / Math.max(1, headCount)))
    : ""

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
                    onChoose={() => setCourt(c.id)}
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
            <div className={cn(CARD, "flex flex-col gap-3")}>
              <div className="flex flex-col gap-1.5">
                <Label>{t("anyDay")}</Label>
                <Segmented
                  value={draft.dayKey}
                  onChange={setDay}
                  options={BOOKING_DAYS.map((d) => ({
                    value: d.key,
                    label: t(`days.${d.key}`),
                  }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("calendar")}</Label>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    <CalendarRange className="size-3" />
                    {t("calendarHint")}
                  </span>
                </div>
                <CourtCalendar
                  key={`${courtId}:${draft.dayKey}`}
                  busy={courtBusy}
                  gaps={courtGaps}
                  slot={draft.slot}
                  durationMin={draft.durationMin}
                  onPick={pickSlot}
                  t={t}
                />
              </div>
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

        {/* PLAYERS */}
        {stepName === "players" ? (
          <div className={FORM_CARD}>
            {draft.fillMode !== "court" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("format")}</Label>
                <div
                  className={
                    roomId ? "pointer-events-none opacity-50" : undefined
                  }
                >
                  <Segmented
                    value={draft.format}
                    onChange={(v) => !roomId && setFormat(v)}
                    options={[
                      { value: "Singles", label: tc("format.singles") },
                      { value: "Doubles", label: tc("format.doubles") },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            {roomId ? (
              <div className="flex flex-col gap-2">
                <Label>{t("roster")}</Label>
                {[USER.initials, ...draft.invitees].map((init) => {
                  const p = playerByInitials(init)
                  const you = init === USER.initials
                  return (
                    <div key={init} className="flex items-center gap-2.5">
                      <PlayerAvatar initials={init} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {p.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {you ? t("host") : t("going")}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("teamGate")}</Label>
                  <Segmented
                    value={draft.fillMode}
                    onChange={(v) => setFillMode(v as FillMode)}
                    options={[
                      { value: "court", label: t("fill.court") },
                      { value: "invite", label: t("fill.invite") },
                      { value: "find", label: t("fill.find") },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.fillMode === "court"
                      ? t("gateHint.court")
                      : draft.fillMode === "invite"
                        ? t("gateHint.invite")
                        : t("gateHint.find")}
                  </p>
                </div>

                {draft.fillMode === "invite" ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {invitable.map((p) => {
                      const added = draft.invitees.includes(p.initials)
                      const atCap = draft.invitees.length >= maxInvites
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-2.5 rounded-2xl p-1.5"
                        >
                          <PlayerAvatar initials={p.initials} />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm">{p.name}</span>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <LevelChip level={p.level} />
                              {tc(`sports.${p.sport}`)}
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant={added ? "secondary" : "outline"}
                            disabled={!added && atCap}
                            className="shrink-0 rounded-full"
                            onClick={() => toggleInvite(p.initials)}
                          >
                            {added ? (
                              <>
                                <Check />
                                {t("added")}
                              </>
                            ) : (
                              t("invite")
                            )}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {draft.fillMode === "find" ? (
                  <p className="inline-flex items-start gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                    <Users className="mt-0.5 size-3.5 shrink-0" />
                    {t("fill.findHint")}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* CONFIRM */}
        {stepName === "confirm" && court && draft.slot ? (
          <div className={cn(FORM_CARD, "gap-3")}>
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
            {draft.fillMode !== "court" ? (
              <SummaryRow
                label={t("format")}
                value={tc(`format.${draft.format.toLowerCase()}`)}
              />
            ) : null}
            <SummaryRow label={t("players")} value={playersLine} />
            <SummaryRow
              label={t("price")}
              value={`${formatVnd(total)} · ${t("perHead", {
                amount: perHead,
              })}`}
            />
            {conflict ? (
              <p className="text-xs font-medium text-destructive">
                {conflict === "self-overlap"
                  ? t("conflictSelf")
                  : t("conflictCourt")}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* PAY */}
        {stepName === "pay" && court && draft.slot ? (
          <div className={FORM_CARD}>
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
              {headCount > 1 ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-brand">
                  <Wallet className="size-3.5 shrink-0" />
                  {t("pay.collectHint", { amount: perHead })}
                </p>
              ) : null}
            </div>

            {/* Method */}
            <div className="flex flex-col gap-1.5">
              <Label>{t("pay.method")}</Label>
              <Segmented
                value={method}
                onChange={setMethod}
                options={[
                  { value: "qr", label: t("pay.qr") },
                  { value: "card", label: t("pay.card") },
                  { value: "ewallet", label: t("pay.ewallet") },
                ]}
              />
            </div>

            {/* Method panel */}
            {method === "card" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pay.cardNumber")}</Label>
                  <div className="relative">
                    <CreditCard className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={card}
                      onChange={(e) => onCard(e.target.value)}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder={t("pay.cardNumberPlaceholder")}
                      aria-label={t("pay.cardNumber")}
                      className="h-9 pl-8 font-mono tracking-wider tabular-nums"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("pay.expiry")}</Label>
                    <Input
                      value={exp}
                      onChange={(e) => onExp(e.target.value)}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      aria-label={t("pay.expiry")}
                      className="h-9 font-mono tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("pay.cvc")}</Label>
                    <Input
                      value={cvc}
                      onChange={(e) => onCvc(e.target.value)}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      aria-label={t("pay.cvc")}
                      className="h-9 font-mono tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pay.cardName")}</Label>
                  <Input
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    autoComplete="cc-name"
                    aria-label={t("pay.cardName")}
                    className="h-9"
                  />
                </div>
              </div>
            ) : method === "qr" ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-muted/30 p-4">
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
            ) : (
              <div className="flex flex-col gap-2">
                {WALLETS.map((w) => {
                  const active = wallet === w.key
                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => setWallet(w.key)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "border-brand bg-brand/8"
                          : "border-border hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold text-white",
                          w.color
                        )}
                      >
                        {w.letter}
                      </span>
                      <span className="font-medium">
                        {t(`pay.wallets.${w.key}`)}
                      </span>
                      {active ? (
                        <Check className="ml-auto size-4 text-brand" />
                      ) : null}
                    </button>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  {t("pay.ewalletHint", {
                    wallet: t(`pay.wallets.${wallet}`),
                  })}
                </p>
              </div>
            )}

            {/* Demo disclaimer */}
            <p className="inline-flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" />
              {t("pay.secure")}
            </p>
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

// Calendar geometry for the booking day view. Taller than the old dialog's
// (40px/hr) so each slot is an easier tap target on a phone.
const CAL_HOUR_PX = 56
const CAL_PX_PER_MIN = CAL_HOUR_PX / 60

/**
 * A single-court day timeline for the chosen day. Booked blocks show as
 * occupied; free gaps are tappable to seed a start time; the current draft
 * selection floats on top as a brand band. Tapping a gap picks its start and a
 * length that fits (capped at one hour) — the player then fine-tunes the exact
 * start and end below.
 */
function CourtCalendar({
  busy,
  gaps,
  slot,
  durationMin,
  onPick,
  t,
}: {
  busy: CourtBand[]
  gaps: CourtBand[]
  slot: string | null
  durationMin: number
  onPick: (start: string, durationMin: number) => void
  t: ReturnType<typeof useTranslations>
}) {
  const startH = Number(COURT_OPEN_FROM.split(":")[0])
  const endH = Number(COURT_OPEN_TO.split(":")[0])
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i)
  const totalMin = diffMinutes(COURT_OPEN_FROM, COURT_OPEN_TO)
  const offsetMin = (hhmm: string) => diffMinutes(COURT_OPEN_FROM, hhmm)

  /** Clamp a band to the visible window → pixel top + height. */
  const place = (start: string, dur: number) => {
    const top = Math.max(0, offsetMin(start))
    const bottom = Math.min(totalMin, offsetMin(start) + dur)
    return {
      top: top * CAL_PX_PER_MIN,
      height: Math.max(0, bottom - top) * CAL_PX_PER_MIN,
    }
  }

  // Open scrolled to the selection, else the first booked block, else evening.
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const focus = slot
      ? offsetMin(slot)
      : busy[0]
        ? offsetMin(busy[0].start)
        : diffMinutes(COURT_OPEN_FROM, "17:00")
    el.scrollTop = Math.max(0, focus * CAL_PX_PER_MIN - el.clientHeight / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot])

  const sel = slot ? place(slot, durationMin) : null
  const selEnd = slot ? addMinutes(slot, durationMin) : ""

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar max-h-[62vh] flex-1 overflow-auto rounded-2xl py-3 ring-1 ring-border/60 lg:max-h-[72vh]"
    >
      <div className="flex">
        {/* Hour gutter */}
        <div
          className="sticky left-0 z-20 w-12 shrink-0 bg-card"
          style={{ height: totalMin * CAL_PX_PER_MIN }}
        >
          {hours.map((h, i) => (
            <span
              key={h}
              className={cn(
                "absolute right-1.5 font-mono text-[10px] text-muted-foreground tabular-nums",
                i > 0 && "-translate-y-1/2"
              )}
              style={{ top: i * CAL_HOUR_PX }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {/* Track */}
        <div
          className="relative flex-1 border-l border-border/50"
          style={{ height: totalMin * CAL_PX_PER_MIN }}
        >
          {/* Hour + half-hour gridlines */}
          {hours.map((h, i) => (
            <React.Fragment key={h}>
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                style={{ top: i * CAL_HOUR_PX }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/20"
                style={{ top: i * CAL_HOUR_PX + CAL_HOUR_PX / 2 }}
              />
            </React.Fragment>
          ))}

          {/* Free gaps — tap to seed a start time */}
          {gaps.map((g) => {
            const { top, height } = place(g.start, g.durationMin)
            if (height < 14) return null
            return (
              <button
                key={`free-${g.start}`}
                type="button"
                onClick={() => onPick(g.start, Math.min(60, g.durationMin))}
                className="group/free absolute inset-x-1 z-0 flex items-center justify-center rounded-lg text-brand/0 transition-colors hover:bg-brand/8 hover:text-brand focus-visible:bg-brand/8 focus-visible:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                style={{ top, height }}
                aria-label={t("freeAt", { time: g.start })}
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-medium opacity-0 transition-opacity group-hover/free:opacity-100 group-focus-visible/free:opacity-100">
                  <Plus className="size-3" />
                  {t("free")}
                </span>
              </button>
            )
          })}

          {/* Booked blocks — occupied, not selectable */}
          {busy.map((b) => {
            const { top, height } = place(b.start, b.durationMin)
            if (height <= 0) return null
            const end = addMinutes(b.start, b.durationMin)
            return (
              <div
                key={`busy-${b.start}`}
                className="pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-lg bg-muted [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,color-mix(in_oklch,var(--muted-foreground)_8%,transparent)_5px,color-mix(in_oklch,var(--muted-foreground)_8%,transparent)_10px)] px-2 py-1 text-muted-foreground ring-1 ring-border/60"
                style={{ top: top + 1, height: Math.max(0, height - 2) }}
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

          {/* Current selection */}
          {sel && sel.height > 0 ? (
            <div
              className="pointer-events-none absolute inset-x-1 z-20 flex flex-col justify-center overflow-hidden rounded-lg bg-brand/15 px-2 py-1 text-brand ring-2 ring-brand/60"
              style={{ top: sel.top, height: sel.height }}
            >
              <span className="truncate text-[11px] font-semibold">
                {t("yourSlot")}
              </span>
              {sel.height >= 34 ? (
                <span className="font-mono text-[10px] leading-none tabular-nums">
                  {slot} – {selEnd}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
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
