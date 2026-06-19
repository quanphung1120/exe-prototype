"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Check, MapPin, Search, Users } from "lucide-react"

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
  COURTS,
  MATCH_SUGGESTIONS,
  USER,
  courtSlots,
  formatVnd,
  playerByInitials,
  slotRange,
} from "@/components/dashboard/data"
import { useBooking, type FillMode } from "@/components/dashboard/booking"

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
    bookings,
    capacityFor,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    confirmBooking,
  } = useBooking()

  const [courtQuery, setCourtQuery] = React.useState("")

  const stepName = steps[step]
  const isLast = step === steps.length - 1
  const sport = court?.sports[0]

  // Court step search
  const needle = courtQuery.trim().toLowerCase()
  const courtResults = needle
    ? COURTS.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.district.toLowerCase().includes(needle)
      )
    : COURTS

  // Slot step grid
  const slots = courtId ? courtSlots(courtId, draft.dayKey) : []
  const bookedTimes = new Set(
    bookings
      .filter(
        (b) =>
          b.status === "confirmed" &&
          !!court &&
          b.venue === court.name &&
          b.dayKey === draft.dayKey
      )
      .map((b) => b.time)
  )

  // Players step
  const maxInvites = capacityFor(draft.format) - 1
  const invitable = sport
    ? [...MATCH_SUGGESTIONS]
        .filter((p) => p.initials !== USER.initials)
        .sort((a, b) => (a.sport === sport ? 0 : 1) - (b.sport === sport ? 0 : 1))
    : MATCH_SUGGESTIONS

  // Confirm step
  const conflict =
    draft.slot &&
    bookings.some(
      (b) =>
        b.status === "confirmed" &&
        b.dayKey === draft.dayKey &&
        b.time === slotRange(draft.slot!)
    )
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
        ? Boolean(draft.slot)
        : true

  const title = court
    ? t("title", { court: court.name })
    : t("pickTitle")

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          closeBooking()
          setCourtQuery("")
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
              <div className="flex flex-col gap-1.5">
                <Label>{t("slotsFor")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {slots.map((s) => {
                    const isTaken = s.taken || bookedTimes.has(slotRange(s.time))
                    return (
                      <button
                        key={s.time}
                        type="button"
                        disabled={isTaken}
                        onClick={() => !isTaken && setSlot(s.time)}
                        className={cn(
                          "rounded-2xl border px-2 py-2 text-center text-sm font-medium tabular-nums transition-colors",
                          isTaken
                            ? "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/50 line-through"
                            : draft.slot === s.time
                              ? "border-brand bg-brand/12 text-brand"
                              : "border-border hover:bg-muted/60"
                        )}
                      >
                        {slotRange(s.time).split(" – ")[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}

          {/* PLAYERS */}
          {stepName === "players" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t("format")}</Label>
                <div className={roomId ? "pointer-events-none opacity-50" : undefined}>
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
                    <Label>{t("fillMode")}</Label>
                    <Segmented
                      value={draft.fillMode}
                      onChange={(v) => setFillMode(v as FillMode)}
                      options={[
                        { value: "court", label: t("fill.court") },
                        { value: "invite", label: t("fill.invite") },
                        { value: "find", label: t("fill.find") },
                      ]}
                    />
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
                value={`${t(`days.${draft.dayKey}`)} · ${slotRange(draft.slot)}`}
              />
              <SummaryRow
                label={t("format")}
                value={tc(`format.${draft.format.toLowerCase()}`)}
              />
              <SummaryRow label={t("players")} value={playersLine} />
              <SummaryRow
                label={t("price")}
                value={`${formatVnd(court.pricePerHour)}${t("perHour")} · ${t(
                  "perHead",
                  {
                    amount: formatVnd(
                      Math.round(court.pricePerHour / Math.max(1, headCount))
                    ),
                  }
                )}`}
              />
              {conflict ? (
                <p className="text-xs font-medium text-destructive">
                  {t("conflictWarning")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          {step > 0 ? (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={back}
            >
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          {isLast ? (
            <Button className="rounded-full" onClick={confirmBooking}>
              <Check />
              {t("confirm")}
            </Button>
          ) : (
            <Button
              className="rounded-full"
              disabled={!canNext}
              onClick={next}
            >
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
