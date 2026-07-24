"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  MapPin,
  Plus,
  Store,
  Trash2,
} from "lucide-react"

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
import { SPORTS, type SportKey } from "@/features/dashboard/data"
import { SportTag } from "@/features/dashboard/shared"
import { provisionVenue } from "@/features/venue/venue-actions"
import { useRouter } from "@/i18n/navigation"
import { PROVINCE_OPTIONS, provinceCodeByName, wardsOf } from "@/lib/vn-admin"

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface VenueDraft {
  name: string
  ward: string
  province: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  /** Map position (WGS84) — optional; set via geolocation or manual entry. */
  lat?: number
  lng?: number
}

interface BrandDraft {
  brandName: string
  managerName: string
}

const EMPTY_DRAFT: VenueDraft = {
  name: "",
  ward: "",
  province: "",
  sports: ["badminton"],
  openFrom: "06:00",
  openTo: "22:00",
}

/**
 * Guided new-account setup: on first-time setup, collect the account's brand
 * (thương hiệu) first, then a LIST of branches (chi nhánh) — courts are added
 * afterwards on each branch's own "Sân" screen (plan 020), so a branch with no
 * courts yet is a valid draft. Provisioning both also seeds the player
 * profile. Adding another branch (`?branch=1`, `addingBranch`) skips the
 * brand step — the account's brand and manager already exist and are reused
 * server-side. Lives outside the dashboard layout so it can run before any
 * venue exists.
 */
export function SetupWizard({ addingBranch }: { addingBranch: boolean }) {
  const t = useTranslations("VenueSetup")
  const router = useRouter()

  const [step, setStep] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [brand, setBrand] = React.useState<BrandDraft>({
    brandName: "",
    managerName: "",
  })
  const [branches, setBranches] = React.useState<VenueDraft[]>([])
  const [draft, setDraft] = React.useState<VenueDraft>(EMPTY_DRAFT)

  const setDraftField = <K extends keyof VenueDraft>(
    key: K,
    value: VenueDraft[K]
  ) => setDraft((v) => ({ ...v, [key]: value }))

  const toggleSport = (s: SportKey) =>
    setDraft((v) => ({
      ...v,
      sports: v.sports.includes(s)
        ? v.sports.filter((x) => x !== s)
        : [...v.sports, s],
    }))

  const brandValid =
    brand.brandName.trim().length >= 2 && brand.managerName.trim().length >= 2

  // A branch must have a map pin — both coordinates present and in valid WGS84
  // range (set via current-location or manual entry).
  const draftCoordsValid =
    draft.lat !== undefined &&
    draft.lng !== undefined &&
    draft.lat >= -90 &&
    draft.lat <= 90 &&
    draft.lng >= -180 &&
    draft.lng <= 180

  const draftValid =
    draft.name.trim().length >= 2 &&
    draft.ward.trim().length >= 1 &&
    draft.province.trim().length >= 1 &&
    draft.sports.length >= 1 &&
    TIME_RE.test(draft.openFrom) &&
    TIME_RE.test(draft.openTo) &&
    draftCoordsValid

  const addBranch = () => {
    if (!draftValid) return
    setBranches((b) => [...b, { ...draft, name: draft.name.trim() }])
    setDraft(EMPTY_DRAFT)
  }
  const removeBranch = (i: number) =>
    setBranches((b) => b.filter((_, idx) => idx !== i))

  const submit = async () => {
    setSubmitting(true)
    try {
      const payload = addingBranch
        ? { branches }
        : {
            brandName: brand.brandName,
            managerName: brand.managerName,
            branches,
          }
      const venueId = await provisionVenue(payload)
      toast.success(t("toast.done", { name: branches[0]?.name ?? "" }))
      router.replace(`/dashboard/venue/${venueId}`)
      router.refresh()
    } catch (e) {
      setSubmitting(false)
      toast.error(t("error"), {
        description: e instanceof Error ? e.message : undefined,
      })
    }
  }

  const stepKinds = addingBranch
    ? (["branches", "review"] as const)
    : (["brand", "branches", "review"] as const)
  const steps = stepKinds.map((k) => t(`steps.${k}`))
  const currentKind = stepKinds[step]
  const canAdvance =
    currentKind === "brand"
      ? brandValid
      : currentKind === "branches"
        ? branches.length > 0
        : true

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
        {currentKind === "brand" ? (
          <BrandStep brand={brand} setBrand={setBrand} />
        ) : currentKind === "branches" ? (
          <BranchesStep
            draft={draft}
            setField={setDraftField}
            setDraft={setDraft}
            toggleSport={toggleSport}
            draftValid={draftValid}
            branches={branches}
            onAdd={addBranch}
            onRemove={removeBranch}
          />
        ) : (
          <ReviewStep
            branches={branches}
            brandName={addingBranch ? undefined : brand.brandName}
          />
        )}
      </div>

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
        {step < steps.length - 1 ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
          >
            {t("next")}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            type="button"
            className="rounded-full"
            disabled={submitting || branches.length === 0}
            onClick={() => void submit()}
          >
            {submitting ? t("creating") : t("finish")}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step 0 (first-time only): brand profile ───────────────────────────────────

function BrandStep({
  brand,
  setBrand,
}: {
  brand: BrandDraft
  setBrand: React.Dispatch<React.SetStateAction<BrandDraft>>
}) {
  const t = useTranslations("VenueSetup")
  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="b-name">{t("form.brandName")}</FieldLabel>
        <Input
          id="b-name"
          value={brand.brandName}
          autoComplete="off"
          placeholder={t("form.brandNamePlaceholder")}
          onChange={(e) =>
            setBrand((b) => ({ ...b, brandName: e.target.value }))
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="b-mgr">{t("form.manager")}</FieldLabel>
        <Input
          id="b-mgr"
          value={brand.managerName}
          autoComplete="off"
          placeholder={t("form.managerPlaceholder")}
          onChange={(e) =>
            setBrand((b) => ({ ...b, managerName: e.target.value }))
          }
        />
      </Field>
    </div>
  )
}

// ── Step 1: branches (chi nhánh) — add one at a time, courts come later ──────

function BranchesStep({
  draft,
  setField,
  setDraft,
  toggleSport,
  draftValid,
  branches,
  onAdd,
  onRemove,
}: {
  draft: VenueDraft
  setField: <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) => void
  setDraft: React.Dispatch<React.SetStateAction<VenueDraft>>
  toggleSport: (s: SportKey) => void
  draftValid: boolean
  branches: VenueDraft[]
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  const t = useTranslations("VenueSetup")
  const tc = useTranslations("Common")
  const provinceCode = provinceCodeByName(draft.province)
  const wardOptions = wardsOf(provinceCode)
  const [locating, setLocating] = React.useState(false)
  // The two location methods are mutually exclusive — pick current-location OR
  // manual coordinates, never both at once.
  const [locMode, setLocMode] = React.useState<"current" | "manual">("current")

  // "" → undefined so an empty field clears the coordinate rather than sending 0.
  const parseCoord = (raw: string): number | undefined => {
    const v = raw.trim()
    if (v === "") return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  // Switching method starts that method fresh — drop whatever coordinate the
  // other one set so the pin has exactly one source.
  const switchLocMode = (m: "current" | "manual") => {
    if (m === locMode) return
    setLocMode(m)
    setDraft((v) => ({ ...v, lat: undefined, lng: undefined }))
  }

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error(t("form.geoUnsupported"))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const round = (n: number) => Math.round(n * 1e6) / 1e6
        setDraft((v) => ({
          ...v,
          lat: round(pos.coords.latitude),
          lng: round(pos.coords.longitude),
        }))
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.error(t("form.geoError"))
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {branches.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {branches.map((b, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {b.ward} · {b.province} · {b.openFrom}–{b.openTo}
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-destructive"
                aria-label={t("removeBranch")}
                onClick={() => onRemove(i)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("noBranchesYet")}
        </p>
      )}

      <div className="flex flex-col gap-5 rounded-2xl bg-muted/40 p-3">
        <Field>
          <FieldLabel htmlFor="v-name">{t("form.name")}</FieldLabel>
          <Input
            id="v-name"
            value={draft.name}
            autoComplete="off"
            placeholder={t("form.namePlaceholder")}
            onChange={(e) => setField("name", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="v-province">{t("form.province")}</FieldLabel>
            <Select
              value={provinceCode ?? ""}
              onValueChange={(code) => {
                const name =
                  PROVINCE_OPTIONS.find((p) => p.code === code)?.name ?? ""
                setDraft((v) => ({ ...v, province: name, ward: "" }))
              }}
            >
              <SelectTrigger id="v-province" className="w-full">
                <SelectValue placeholder={t("form.provincePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {PROVINCE_OPTIONS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="v-ward">{t("form.ward")}</FieldLabel>
            <Select
              value={draft.ward}
              onValueChange={(name) => setField("ward", name ?? "")}
              disabled={wardOptions.length === 0}
            >
              <SelectTrigger id="v-ward" className="w-full">
                <SelectValue placeholder={t("form.wardPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {wardOptions.map((w) => (
                  <SelectItem key={w.code} value={w.name}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel>{t("form.location")}</FieldLabel>
          <p className="-mt-1 text-xs text-muted-foreground">
            {t("form.locationHint")}
          </p>
          {/* Pick ONE method — current-location or manual coordinates. Switching
              clears any coordinate the other method set, so there's a single
              source of truth for the pin. */}
          <div
            role="radiogroup"
            aria-label={t("form.location")}
            className="flex w-fit items-center gap-0.5 rounded-full bg-muted/60 p-0.5"
          >
            {(["current", "manual"] as const).map((m) => {
              const active = locMode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => switchLocMode(m)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`form.locationMode.${m}`)}
                </button>
              )
            })}
          </div>
          {locMode === "current" ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start rounded-full"
                disabled={locating}
                onClick={useMyLocation}
              >
                <LocateFixed />
                {locating ? t("form.locating") : t("form.useCurrentLocation")}
              </Button>
              {draft.lat !== undefined && draft.lng !== undefined ? (
                <p className="flex items-center gap-1 text-xs text-brand">
                  <MapPin className="size-3.5" />
                  {t("form.coordsSet")} · {draft.lat}, {draft.lng}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="v-lat">{t("form.latitude")}</FieldLabel>
                <Input
                  id="v-lat"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={draft.lat ?? ""}
                  placeholder={t("form.latitudePlaceholder")}
                  onChange={(e) => setField("lat", parseCoord(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="v-lng">{t("form.longitude")}</FieldLabel>
                <Input
                  id="v-lng"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={draft.lng ?? ""}
                  placeholder={t("form.longitudePlaceholder")}
                  onChange={(e) => setField("lng", parseCoord(e.target.value))}
                />
              </div>
            </div>
          )}
        </Field>
        <Field>
          <FieldLabel>{t("form.sports")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => {
              const on = draft.sports.includes(s.key)
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
              value={draft.openFrom}
              onChange={(e) => setField("openFrom", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="v-to">{t("form.openTo")}</FieldLabel>
            <Input
              id="v-to"
              type="time"
              value={draft.openTo}
              onChange={(e) => setField("openTo", e.target.value)}
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start rounded-full"
          disabled={!draftValid}
          onClick={onAdd}
        >
          <Plus />
          {t("addBranch")}
        </Button>
      </div>
    </div>
  )
}

// ── Step 2: review ────────────────────────────────────────────────────────────

function ReviewStep({
  branches,
  brandName,
}: {
  branches: VenueDraft[]
  brandName?: string
}) {
  const t = useTranslations("VenueSetup")
  return (
    <div className="flex flex-col gap-4 text-sm">
      {brandName ? (
        <div className="text-xs font-semibold text-muted-foreground uppercase">
          {brandName}
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
          {t("review.branches", { count: branches.length })}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {branches.map((b, i) => (
            <li key={i} className="py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold">{b.name}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>
                  {b.ward} · {b.province} · {b.openFrom}–{b.openTo}
                </span>
                {b.lat !== undefined && b.lng !== undefined ? (
                  <MapPin className="size-3 shrink-0 text-brand" />
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {b.sports.map((s) => (
                  <SportTag key={s} sport={s} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t("review.note")}</p>
    </div>
  )
}
