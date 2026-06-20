"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
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
import { LevelChip, PlayerAvatar } from "@/components/dashboard/shared"
import {
  BOOKING_DAYS,
  addMinutes,
  diffMinutes,
  formatDuration,
  formatVnd,
  formatVndFull,
  priceFor,
  slotRange,
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

export function BookingDialog() {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")
  const {
    open,
    closeBooking,
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
    setFormat,
    setFillMode,
    toggleInvite,
    paying,
    pay,
  } = useBooking()
  const {
    courts: COURTS,
    players: MATCH_SUGGESTIONS,
    user: USER,
    playerByInitials,
  } = useData()

  const [courtQuery, setCourtQuery] = React.useState("")

  // Payment screen — purely cosmetic local state (like the court search box).
  const [method, setMethod] = React.useState<PayMethod>("qr")
  const [card, setCard] = React.useState("")
  const [exp, setExp] = React.useState("")
  const [cvc, setCvc] = React.useState("")
  const [cardName, setCardName] = React.useState(USER.name)
  const [wallet, setWallet] = React.useState<WalletKey>("momo")

  const resetPayment = () => {
    setMethod("qr")
    setCard("")
    setExp("")
    setCvc("")
    setCardName(USER.name)
    setWallet("momo")
  }

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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          closeBooking()
          setCourtQuery("")
          resetPayment()
        }
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

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

        <div className="flex flex-col gap-4 py-1">
          {/* COURT */}
          {stepName === "court" ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={courtQuery}
                  onChange={(e) => setCourtQuery(e.target.value)}
                  placeholder={t("courtSearch")}
                  aria-label={t("courtSearch")}
                  className="h-9 pl-8"
                />
              </div>
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-border p-1">
                {courtResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCourt(c.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                      courtId === c.id
                        ? "bg-secondary font-medium"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      · {c.district}
                    </span>
                    <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums">
                      {formatVnd(c.pricePerHour)}
                    </span>
                  </button>
                ))}
                {courtResults.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    {t("noCourts")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* SLOT */}
          {stepName === "slot" ? (
            <>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("startTime")}</Label>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="time"
                      value={draft.slot ?? ""}
                      min="06:00"
                      max="22:00"
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
                      min={draft.slot ?? "06:00"}
                      max="23:00"
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
                    "flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm ring-1",
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
            </>
          ) : null}

          {/* PLAYERS */}
          {stepName === "players" ? (
            <>
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
                    <div className="flex flex-col gap-1">
                      {invitable.map((p) => {
                        const added = draft.invitees.includes(p.initials)
                        const atCap = draft.invitees.length >= maxInvites
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2.5 p-1"
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
            </>
          ) : null}

          {/* CONFIRM */}
          {stepName === "confirm" && court && draft.slot ? (
            <div className="flex flex-col gap-3 rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
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
              <SummaryRow
                label={t("format")}
                value={tc(`format.${draft.format.toLowerCase()}`)}
              />
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
            <div className="flex flex-col gap-4">
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
                    <FakeQr
                      seed={`${court.id}:${draft.dayKey}:${draft.slot}`}
                    />
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

        <DialogFooter className="flex-row justify-between gap-2">
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
                  {t("pay.payNow", {
                    amount: court ? formatVnd(total) : "",
                  })}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
