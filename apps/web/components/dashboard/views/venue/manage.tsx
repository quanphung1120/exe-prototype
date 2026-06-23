"use client"

import * as React from "react"
import { useForm, type AnyFieldApi } from "@tanstack/react-form"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as z from "zod"
import {
  Check,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Star,
  Store,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatVnd,
  SPORTS,
  type CourtState,
  type SportKey,
  type Venue,
  type VenueCourt,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useVenueData } from "@/components/dashboard/venue-data-provider"
import { SportTag } from "@/components/dashboard/shared"
import { venueBase } from "@/components/dashboard/venue/nav"
import { VenueEmpty, VenuePanel } from "@/components/dashboard/venue/shared"
import {
  addCourt,
  createVenue,
  deleteCourt,
  deleteVenue,
  updateCourt,
  updateVenue,
} from "@/lib/venue-actions"
import { useRouter } from "@/i18n/navigation"

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const COURT_STATES: CourtState[] = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
]

// Status dot color per court state, for the courts list.
const STATE_DOT: Record<CourtState, string> = {
  available: "bg-brand",
  "in-play": "bg-lime",
  upcoming: "bg-chart-4",
  maintenance: "bg-muted-foreground",
}

// ── Shared form field ─────────────────────────────────────────────────────────

/**
 * A labelled text/number input bound to a TanStack field — factors out the
 * touched/invalid/error wiring repeated by every field in the forms below.
 */
function TextField({
  field,
  label,
  numeric,
  ...input
}: {
  field: AnyFieldApi
  label: React.ReactNode
  numeric?: boolean
} & Omit<
  React.ComponentProps<typeof Input>,
  "id" | "name" | "value" | "onChange" | "onBlur"
>) {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={String(field.state.value ?? "")}
        onBlur={field.handleBlur}
        onChange={(e) =>
          field.handleChange(
            numeric ? Math.max(0, Number(e.target.value) || 0) : e.target.value
          )
        }
        aria-invalid={invalid}
        {...input}
      />
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
    </Field>
  )
}

/** One Dialog shell shared by both forms — content is keyed/mounted by callers. */
function FormDialog({
  open,
  onClose,
  srTitle,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  srTitle: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className={cn("max-h-[88vh] overflow-y-auto", className)}>
        {open ? (
          children
        ) : (
          <DialogTitle className="sr-only">{srTitle}</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function VenueManageView() {
  const t = useTranslations("VenueManage")
  const router = useRouter()
  const { venues } = useData()
  const {
    venueId: activeVenueId,
    venue: activeVenue,
    venueCourts,
  } = useVenueData()

  const [venueDialog, setVenueDialog] = React.useState<{
    mode: "create" | "edit"
    venue?: Venue
  } | null>(null)
  const [courtDialog, setCourtDialog] = React.useState<{
    mode: "create" | "edit"
    court?: VenueCourt
  } | null>(null)
  const [removeVenueTarget, setRemoveVenueTarget] =
    React.useState<Venue | null>(null)
  const [removeCourtTarget, setRemoveCourtTarget] =
    React.useState<VenueCourt | null>(null)

  // Switching venues is now plain navigation into that venue's workspace.
  const switchVenue = (id: string) => {
    if (id === activeVenueId) return
    router.push(venueBase(id))
  }

  const confirmRemoveVenue = async () => {
    if (!removeVenueTarget) return
    const name = removeVenueTarget.name
    const id = removeVenueTarget.id
    setRemoveVenueTarget(null)
    try {
      await deleteVenue(id)
      toast.success(t("toast.venueDeleted", { name }))
      // If we deleted the venue we're viewing, move to a surviving one.
      if (id === activeVenueId) {
        const next = venues.find((v) => v.id !== id)
        if (next) router.push(venueBase(next.id))
      } else {
        router.refresh()
      }
    } catch (e) {
      toast.error(t("error"), {
        description: e instanceof Error ? e.message : undefined,
      })
    }
  }

  const confirmRemoveCourt = async () => {
    if (!removeCourtTarget) return
    const name = removeCourtTarget.name
    const id = removeCourtTarget.id
    setRemoveCourtTarget(null)
    try {
      await deleteCourt(activeVenueId, id)
      router.refresh()
      toast.success(t("toast.courtDeleted", { name }))
    } catch (e) {
      toast.error(t("error"), {
        description: e instanceof Error ? e.message : undefined,
      })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          className="rounded-full"
          onClick={() => setVenueDialog({ mode: "create" })}
        >
          <Plus />
          {t("newVenue")}
        </Button>
      </div>

      {/* ── Venues ──────────────────────────────────────────────────── */}
      <VenuePanel
        title={
          <span className="inline-flex items-center gap-2">
            {t("yourVenues")}
            <Badge variant="secondary" className="tabular-nums">
              {venues.length}
            </Badge>
          </span>
        }
        icon={Store}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {venues.map((v) => (
            <VenueCard
              key={v.id}
              venue={v}
              active={v.id === activeVenueId}
              canDelete={venues.length > 1}
              onSwitch={() => switchVenue(v.id)}
              onEdit={() => setVenueDialog({ mode: "edit", venue: v })}
              onDelete={() => setRemoveVenueTarget(v)}
            />
          ))}
        </div>
      </VenuePanel>

      {/* ── Courts of the active venue ──────────────────────────────── */}
      <VenuePanel
        title={t("courtsAt", { venue: activeVenue.name })}
        icon={Store}
        action={
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setCourtDialog({ mode: "create" })}
          >
            <Plus />
            {t("addCourt")}
          </Button>
        }
      >
        {venueCourts.length === 0 ? (
          <VenueEmpty text={t("noCourts")} />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {venueCourts.map((court) => (
              <CourtRow
                key={court.id}
                court={court}
                onEdit={() => setCourtDialog({ mode: "edit", court })}
                onDelete={() => setRemoveCourtTarget(court)}
              />
            ))}
          </div>
        )}
      </VenuePanel>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <FormDialog
        open={venueDialog !== null}
        onClose={() => setVenueDialog(null)}
        srTitle={t("editVenue")}
        className="sm:max-w-lg"
      >
        {venueDialog ? (
          <VenueForm
            key={venueDialog.venue?.id ?? "new"}
            mode={venueDialog.mode}
            venue={venueDialog.venue}
            onClose={() => setVenueDialog(null)}
            onDone={(created) => {
              // Drop the operator straight into a freshly created venue.
              if (created) router.push(venueBase(created.id))
              else router.refresh()
            }}
          />
        ) : null}
      </FormDialog>

      <FormDialog
        open={courtDialog !== null}
        onClose={() => setCourtDialog(null)}
        srTitle={t("addCourt")}
        className="sm:max-w-md"
      >
        {courtDialog ? (
          <CourtForm
            key={courtDialog.court?.id ?? "new"}
            venueId={activeVenueId}
            mode={courtDialog.mode}
            court={courtDialog.court}
            onClose={() => setCourtDialog(null)}
            onDone={() => router.refresh()}
          />
        ) : null}
      </FormDialog>

      <RemoveDialog
        open={removeVenueTarget !== null}
        onCancel={() => setRemoveVenueTarget(null)}
        onConfirm={confirmRemoveVenue}
        title={t("deleteVenue.title")}
        description={t("deleteVenue.description", {
          name: removeVenueTarget?.name ?? "",
        })}
      />
      <RemoveDialog
        open={removeCourtTarget !== null}
        onCancel={() => setRemoveCourtTarget(null)}
        onConfirm={confirmRemoveCourt}
        title={t("deleteCourt.title")}
        description={t("deleteCourt.description", {
          name: removeCourtTarget?.name ?? "",
        })}
      />
    </div>
  )
}

// ── Venue card ───────────────────────────────────────────────────────────────

function VenueCard({
  venue,
  active,
  canDelete,
  onSwitch,
  onEdit,
  onDelete,
}: {
  venue: Venue
  active: boolean
  canDelete: boolean
  onSwitch: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations("VenueManage")
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/5 dark:ring-foreground/10",
        active && "ring-2 ring-brand"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary font-heading text-sm font-bold text-secondary-foreground">
          {venue.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-heading font-bold">
              {venue.name}
            </span>
            {active ? (
              <Badge variant="default" className="gap-1">
                <Check className="size-3" />
                {t("active")}
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            <span className="truncate">
              {venue.district} · {venue.city}
            </span>
          </div>
        </div>
        {venue.reviews > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
            <Star className="size-3 fill-lime text-lime" />
            {venue.rating}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {venue.sports.map((s) => (
          <SportTag key={s} sport={s} />
        ))}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Clock className="size-3" />
          {venue.openFrom}–{venue.openTo}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={active ? "secondary" : "outline"}
          className="rounded-full"
          disabled={active}
          onClick={onSwitch}
        >
          {active ? t("current") : t("switchTo")}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full"
            aria-label={t("edit")}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full text-muted-foreground hover:text-destructive"
            aria-label={t("delete")}
            disabled={!canDelete}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Court row ────────────────────────────────────────────────────────────────

function CourtRow({
  court,
  onEdit,
  onDelete,
}: {
  court: VenueCourt
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations("VenueManage")
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted font-heading text-sm font-bold">
        {court.name
          .split(" ")
          .slice(0, 2)
          .map((w) => w[0])
          .join("")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{court.name}</span>
          <SportTag sport={court.sport} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn("size-1.5 rounded-full", STATE_DOT[court.state])}
          />
          <span>{t(`courtState.${court.state}`)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">
            {court.surface} · {formatVnd(court.pricePerHour)}
            {t("perHour")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full"
          aria-label={t("edit")}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full text-muted-foreground hover:text-destructive"
          aria-label={t("delete")}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

// ── Remove confirmation ──────────────────────────────────────────────────────

function RemoveDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  description: string
}) {
  const t = useTranslations("VenueManage")
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="rounded-full"
            onClick={onConfirm}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Venue form ───────────────────────────────────────────────────────────────

function VenueForm({
  mode,
  venue,
  onClose,
  onDone,
}: {
  mode: "create" | "edit"
  venue?: Venue
  onClose: () => void
  /** Called after a successful save; receives the created venue on create. */
  onDone: (created?: Venue) => void
}) {
  const t = useTranslations("VenueManage")
  const tc = useTranslations("Common")

  const schema = z.object({
    name: z.string().min(2, t("validation.name")).max(60),
    district: z.string().min(1, t("validation.required")).max(60),
    city: z.string().min(1, t("validation.required")).max(60),
    sports: z
      .array(z.enum(["tennis", "pickleball", "badminton"]))
      .min(1, t("validation.sports")),
    openFrom: z.string().regex(TIME_RE, t("validation.time")),
    openTo: z.string().regex(TIME_RE, t("validation.time")),
    managerName: z.string().min(2, t("validation.name")).max(60),
  })

  const form = useForm({
    defaultValues: {
      name: venue?.name ?? "",
      district: venue?.district ?? "",
      city: venue?.city ?? "Hà Nội",
      sports: (venue?.sports ?? ["badminton"]) as SportKey[],
      openFrom: venue?.openFrom ?? "06:00",
      openTo: venue?.openTo ?? "22:00",
      managerName: venue?.manager.name ?? "",
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        if (mode === "create") {
          const created = await createVenue(value)
          toast.success(t("toast.venueCreated", { name: value.name }))
          onDone(created)
        } else if (venue) {
          await updateVenue(venue.id, value)
          toast.success(t("toast.venueUpdated", { name: value.name }))
          onDone()
        }
        onClose()
      } catch (e) {
        toast.error(t("error"), {
          description: e instanceof Error ? e.message : undefined,
        })
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? t("newVenue") : t("editVenue")}
        </DialogTitle>
        <DialogDescription>{t("form.description")}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5 gap-5">
        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              label={t("form.name")}
              placeholder={t("form.namePlaceholder")}
              autoComplete="off"
            />
          )}
        </form.Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <form.Field name="district">
            {(field) => (
              <TextField
                field={field}
                label={t("form.district")}
                autoComplete="off"
              />
            )}
          </form.Field>
          <form.Field name="city">
            {(field) => (
              <TextField
                field={field}
                label={t("form.city")}
                autoComplete="off"
              />
            )}
          </form.Field>
        </div>

        <form.Field name="sports">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            const value = field.state.value
            return (
              <Field data-invalid={invalid}>
                <FieldLabel>{t("form.sports")}</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {SPORTS.map((s) => {
                    const on = value.includes(s.key)
                    return (
                      <Button
                        key={s.key}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() =>
                          field.handleChange(
                            on
                              ? value.filter((x) => x !== s.key)
                              : [...value, s.key]
                          )
                        }
                      >
                        {tc(`sports.${s.key}`)}
                      </Button>
                    )
                  })}
                </div>
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <div className="grid grid-cols-2 gap-5">
          <form.Field name="openFrom">
            {(field) => (
              <TextField field={field} label={t("form.openFrom")} type="time" />
            )}
          </form.Field>
          <form.Field name="openTo">
            {(field) => (
              <TextField field={field} label={t("form.openTo")} type="time" />
            )}
          </form.Field>
        </div>

        <form.Field name="managerName">
          {(field) => (
            <TextField
              field={field}
              label={t("form.manager")}
              placeholder={t("form.managerPlaceholder")}
              autoComplete="off"
            />
          )}
        </form.Field>
      </FieldGroup>

      <DialogFooter className="flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onClose}
        >
          {t("cancel")}
        </Button>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button
              type="submit"
              className="rounded-full"
              disabled={submitting}
            >
              {mode === "create" ? t("create") : t("save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

// ── Court form ───────────────────────────────────────────────────────────────

function CourtForm({
  venueId,
  mode,
  court,
  onClose,
  onDone,
}: {
  venueId: string
  mode: "create" | "edit"
  court?: VenueCourt
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("VenueManage")
  const tc = useTranslations("Common")

  const schema = z.object({
    name: z.string().min(1, t("validation.required")).max(40),
    sport: z.enum(["tennis", "pickleball", "badminton"]),
    surface: z.string().min(1, t("validation.required")).max(40),
    pricePerHour: z
      .number()
      .int()
      .min(0, t("validation.price"))
      .max(100_000_000),
    state: z.enum(["available", "in-play", "upcoming", "maintenance"]),
  })

  const form = useForm({
    defaultValues: {
      name: court?.name ?? "",
      sport: (court?.sport ?? "badminton") as SportKey,
      surface: court?.surface ?? "",
      pricePerHour: court?.pricePerHour ?? 300000,
      state: (court?.state ?? "available") as CourtState,
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        if (mode === "create") {
          await addCourt(venueId, value)
          toast.success(t("toast.courtCreated", { name: value.name }))
        } else if (court) {
          await updateCourt(venueId, court.id, value)
          toast.success(t("toast.courtUpdated", { name: value.name }))
        }
        onDone()
        onClose()
      } catch (e) {
        toast.error(t("error"), {
          description: e instanceof Error ? e.message : undefined,
        })
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? t("addCourt") : t("editCourt")}
        </DialogTitle>
        <DialogDescription>{t("courtForm.description")}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5 gap-5">
        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              label={t("courtForm.name")}
              placeholder={t("courtForm.namePlaceholder")}
              autoComplete="off"
            />
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-5">
          <form.Field name="sport">
            {(field) => (
              <Field>
                <FieldLabel>{t("courtForm.sport")}</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as SportKey)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => tc(`sports.${v as SportKey}`)}
                    </SelectValue>
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
            )}
          </form.Field>

          <form.Field name="state">
            {(field) => (
              <Field>
                <FieldLabel>{t("courtForm.state")}</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as CourtState)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => t(`courtState.${v as CourtState}`)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COURT_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`courtState.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="surface">
          {(field) => (
            <TextField
              field={field}
              label={t("courtForm.surface")}
              placeholder={t("courtForm.surfacePlaceholder")}
              autoComplete="off"
            />
          )}
        </form.Field>

        <form.Field name="pricePerHour">
          {(field) => (
            <TextField
              field={field}
              label={t("courtForm.price")}
              numeric
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
            />
          )}
        </form.Field>
      </FieldGroup>

      <DialogFooter className="flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onClose}
        >
          {t("cancel")}
        </Button>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button
              type="submit"
              className="rounded-full"
              disabled={submitting}
            >
              {mode === "create" ? t("create") : t("save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
