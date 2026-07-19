"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Check, Plus, Store, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatVnd, SPORTS, type SportKey } from "@/features/dashboard/data"
import { SportTag } from "@/features/dashboard/shared"
import { provisionVenue } from "@/features/venue/venue-actions"
import { useRouter } from "@/i18n/navigation"

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface CourtDraft {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
}

interface VenueDraft {
  name: string
  district: string
  city: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  managerName: string
}

/**
 * Guided new-account setup: collect the venue profile, then its courts, then
 * provision both (the API also seeds the player profile). Lives outside the
 * dashboard layout so it can run before any venue exists.
 */
export function SetupWizard() {
  const t = useTranslations("VenueSetup")
  const router = useRouter()

  const [step, setStep] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [venue, setVenue] = React.useState<VenueDraft>({
    name: "",
    district: "",
    city: "Hà Nội",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    managerName: "",
  })
  const [courts, setCourts] = React.useState<CourtDraft[]>([])

  const setVenueField = <K extends keyof VenueDraft>(
    key: K,
    value: VenueDraft[K]
  ) => setVenue((v) => ({ ...v, [key]: value }))

  const toggleSport = (s: SportKey) =>
    setVenue((v) => ({
      ...v,
      sports: v.sports.includes(s)
        ? v.sports.filter((x) => x !== s)
        : [...v.sports, s],
    }))

  const venueValid =
    venue.name.trim().length >= 2 &&
    venue.district.trim().length >= 1 &&
    venue.city.trim().length >= 1 &&
    venue.sports.length >= 1 &&
    venue.managerName.trim().length >= 2 &&
    TIME_RE.test(venue.openFrom) &&
    TIME_RE.test(venue.openTo)

  const addCourt = (court: CourtDraft) => setCourts((c) => [...c, court])
  const removeCourt = (i: number) =>
    setCourts((c) => c.filter((_, idx) => idx !== i))

  const submit = async () => {
    setSubmitting(true)
    try {
      await provisionVenue({ ...venue, courts })
      toast.success(t("toast.done", { name: venue.name }))
      router.replace("/dashboard/venue")
      router.refresh()
    } catch (e) {
      setSubmitting(false)
      toast.error(t("error"), {
        description: e instanceof Error ? e.message : undefined,
      })
    }
  }

  const steps = [t("steps.venue"), t("steps.courts"), t("steps.review")]

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Store className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                i < step && "bg-brand text-brand-foreground",
                i === step && "bg-brand/15 text-brand ring-1 ring-brand",
                i > step && "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs font-medium",
                i === step ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/5 dark:ring-foreground/10">
        {step === 0 ? (
          <VenueStep
            venue={venue}
            setField={setVenueField}
            toggleSport={toggleSport}
          />
        ) : step === 1 ? (
          <CourtsStep
            venue={venue}
            courts={courts}
            onAdd={addCourt}
            onRemove={removeCourt}
          />
        ) : (
          <ReviewStep venue={venue} courts={courts} />
        )}
      </div>

      {/* Footer nav */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft />
          {t("back")}
        </Button>
        {step < 2 ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={step === 0 ? !venueValid : courts.length === 0}
            onClick={() => setStep((s) => s + 1)}
          >
            {t("next")}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            type="button"
            className="rounded-full"
            disabled={submitting || courts.length === 0}
            onClick={() => void submit()}
          >
            {submitting ? t("creating") : t("finish")}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step 1: venue profile ─────────────────────────────────────────────────────

function VenueStep({
  venue,
  setField,
  toggleSport,
}: {
  venue: VenueDraft
  setField: <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) => void
  toggleSport: (s: SportKey) => void
}) {
  const t = useTranslations("VenueSetup")
  const tc = useTranslations("Common")
  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="v-name">{t("form.name")}</FieldLabel>
        <Input
          id="v-name"
          value={venue.name}
          autoComplete="off"
          placeholder={t("form.namePlaceholder")}
          onChange={(e) => setField("name", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="v-district">{t("form.district")}</FieldLabel>
          <Input
            id="v-district"
            value={venue.district}
            autoComplete="off"
            onChange={(e) => setField("district", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="v-city">{t("form.city")}</FieldLabel>
          <Input
            id="v-city"
            value={venue.city}
            autoComplete="off"
            onChange={(e) => setField("city", e.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>{t("form.sports")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => {
            const on = venue.sports.includes(s.key)
            return (
              <Button
                key={s.key}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                className="rounded-full"
                onClick={() => toggleSport(s.key)}
              >
                {tc(`sports.${s.key}`)}
              </Button>
            )
          })}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field>
          <FieldLabel htmlFor="v-from">{t("form.openFrom")}</FieldLabel>
          <Input
            id="v-from"
            type="time"
            value={venue.openFrom}
            onChange={(e) => setField("openFrom", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="v-to">{t("form.openTo")}</FieldLabel>
          <Input
            id="v-to"
            type="time"
            value={venue.openTo}
            onChange={(e) => setField("openTo", e.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="v-mgr">{t("form.manager")}</FieldLabel>
        <Input
          id="v-mgr"
          value={venue.managerName}
          autoComplete="off"
          placeholder={t("form.managerPlaceholder")}
          onChange={(e) => setField("managerName", e.target.value)}
        />
      </Field>
    </div>
  )
}

// ── Step 2: courts ────────────────────────────────────────────────────────────

function CourtsStep({
  venue,
  courts,
  onAdd,
  onRemove,
}: {
  venue: VenueDraft
  courts: CourtDraft[]
  onAdd: (court: CourtDraft) => void
  onRemove: (i: number) => void
}) {
  const t = useTranslations("VenueSetup")
  const tc = useTranslations("Common")
  const firstSport = venue.sports[0] ?? "badminton"
  const [draft, setDraft] = React.useState<CourtDraft>({
    name: "",
    sport: firstSport,
    surface: "",
    pricePerHour: 300000,
  })

  const add = () => {
    if (draft.name.trim().length < 1) return
    onAdd({ ...draft, name: draft.name.trim() })
    setDraft({ name: "", sport: firstSport, surface: "", pricePerHour: 300000 })
  }

  return (
    <div className="flex flex-col gap-4">
      {courts.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {courts.map((c, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <SportTag sport={c.sport} />
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.surface || "—"} · {formatVnd(c.pricePerHour)}
                  {t("perHour")}
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-destructive"
                aria-label={t("removeCourt")}
                onClick={() => onRemove(i)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("noCourtsYet")}
        </p>
      )}

      {/* Add-court row */}
      <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="c-name">{t("courtForm.name")}</FieldLabel>
            <Input
              id="c-name"
              value={draft.name}
              autoComplete="off"
              placeholder={t("courtForm.namePlaceholder")}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel>{t("courtForm.sport")}</FieldLabel>
            <Select
              value={draft.sport}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, sport: v as SportKey }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => tc(`sports.${v as SportKey}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {tc(`sports.${s.key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="c-surface">{t("courtForm.surface")}</FieldLabel>
            <Input
              id="c-surface"
              value={draft.surface}
              autoComplete="off"
              placeholder={t("courtForm.surfacePlaceholder")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, surface: e.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-price">{t("courtForm.price")}</FieldLabel>
            <Input
              id="c-price"
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={String(draft.pricePerHour)}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  pricePerHour: Math.max(0, Number(e.target.value) || 0),
                }))
              }
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start rounded-full"
          disabled={draft.name.trim().length < 1}
          onClick={add}
        >
          <Plus />
          {t("addCourt")}
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: review ────────────────────────────────────────────────────────────

function ReviewStep({
  venue,
  courts,
}: {
  venue: VenueDraft
  courts: CourtDraft[]
}) {
  const t = useTranslations("VenueSetup")
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="font-heading text-lg font-bold">{venue.name}</div>
        <div className="text-muted-foreground">
          {venue.district} · {venue.city} · {venue.openFrom}–{venue.openTo}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {venue.sports.map((s) => (
            <SportTag key={s} sport={s} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
          {t("review.courts", { count: courts.length })}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {courts.map((c, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <SportTag sport={c.sport} />
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatVnd(c.pricePerHour)}
                {t("perHour")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t("review.note")}</p>
    </div>
  )
}
