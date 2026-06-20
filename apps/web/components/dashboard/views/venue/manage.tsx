"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
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
import { SportTag } from "@/components/dashboard/shared"
import { VenuePanel } from "@/components/dashboard/venue/shared"
import {
  addCourt,
  createVenue,
  deleteCourt,
  deleteVenue,
  setActiveVenue,
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

// ── Main view ────────────────────────────────────────────────────────────────

export function VenueManageView() {
  const t = useTranslations("VenueManage")
  const router = useRouter()
  const { venues, activeVenueId, venue: activeVenue, venueCourts } = useData()

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

  const switchVenue = async (id: string) => {
    if (id === activeVenueId) return
    try {
      await setActiveVenue(id)
      router.refresh()
    } catch {
      toast.error(t("error"))
    }
  }

  const confirmRemoveVenue = async () => {
    if (!removeVenueTarget) return
    const name = removeVenueTarget.name
    setRemoveVenueTarget(null)
    try {
      await deleteVenue(removeVenueTarget.id)
      router.refresh()
      toast.success(t("toast.venueDeleted", { name }))
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
      <VenuePanel title={t("yourVenues")} icon={Store}>
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
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("noCourts")}
          </p>
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
      <VenueFormDialog
        state={venueDialog}
        onClose={() => setVenueDialog(null)}
        onDone={() => router.refresh()}
      />
      <CourtFormDialog
        venueId={activeVenueId}
        state={courtDialog}
        onClose={() => setCourtDialog(null)}
        onDone={() => router.refresh()}
      />

      <AlertDialog
        open={removeVenueTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveVenueTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteVenue.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteVenue.description", {
                name: removeVenueTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="rounded-full"
              onClick={confirmRemoveVenue}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeCourtTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveCourtTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCourt.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteCourt.description", {
                name: removeCourtTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="rounded-full"
              onClick={confirmRemoveCourt}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        {active ? (
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full"
            disabled
          >
            {t("current")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={onSwitch}
          >
            {t("switchTo")}
          </Button>
        )}
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
        <div className="truncate text-xs text-muted-foreground">
          {court.surface} · {formatVnd(court.pricePerHour)}
          {t("perHour")}
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

// ── Venue form dialog ────────────────────────────────────────────────────────

function VenueFormDialog({
  state,
  onClose,
  onDone,
}: {
  state: { mode: "create" | "edit"; venue?: Venue } | null
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("VenueManage")
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {state ? (
          <VenueForm
            key={state.venue?.id ?? "new"}
            mode={state.mode}
            venue={state.venue}
            onClose={onClose}
            onDone={onDone}
          />
        ) : null}
        {!state ? <DialogTitle className="sr-only">{t("title")}</DialogTitle> : null}
      </DialogContent>
    </Dialog>
  )
}

function VenueForm({
  mode,
  venue,
  onClose,
  onDone,
}: {
  mode: "create" | "edit"
  venue?: Venue
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("VenueManage")
  const tc = useTranslations("Common")

  const schema = z.object({
    name: z.string().min(2, t("validation.name")).max(60),
    district: z.string().min(1, t("validation.required")).max(60),
    city: z.string().min(1, t("validation.required")).max(60),
    sports: z.array(z.enum(["tennis", "pickleball", "badminton"])).min(1, t("validation.sports")),
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
          await createVenue(value)
          toast.success(t("toast.venueCreated", { name: value.name }))
        } else if (venue) {
          await updateVenue(venue.id, value)
          toast.success(t("toast.venueUpdated", { name: value.name }))
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
          {mode === "create" ? t("newVenue") : t("editVenue")}
        </DialogTitle>
        <DialogDescription>{t("form.description")}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5 gap-5">
        <form.Field name="name">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>{t("form.name")}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={invalid}
                  placeholder={t("form.namePlaceholder")}
                  autoComplete="off"
                />
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <form.Field name="district">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("form.district")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid}
                    autoComplete="off"
                  />
                  {invalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="city">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>{t("form.city")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid}
                    autoComplete="off"
                  />
                  {invalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              )
            }}
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
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("form.openFrom")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="time"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid}
                  />
                  {invalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="openTo">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("form.openTo")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="time"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid}
                  />
                  {invalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              )
            }}
          </form.Field>
        </div>

        <form.Field name="managerName">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("form.manager")}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={invalid}
                  placeholder={t("form.managerPlaceholder")}
                  autoComplete="off"
                />
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
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
            <Button type="submit" className="rounded-full" disabled={submitting}>
              {mode === "create" ? t("create") : t("save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

// ── Court form dialog ────────────────────────────────────────────────────────

function CourtFormDialog({
  venueId,
  state,
  onClose,
  onDone,
}: {
  venueId: string
  state: { mode: "create" | "edit"; court?: VenueCourt } | null
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("VenueManage")
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        {state ? (
          <CourtForm
            key={state.court?.id ?? "new"}
            venueId={venueId}
            mode={state.mode}
            court={state.court}
            onClose={onClose}
            onDone={onDone}
          />
        ) : (
          <DialogTitle className="sr-only">{t("addCourt")}</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("courtForm.name")}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={invalid}
                  placeholder={t("courtForm.namePlaceholder")}
                  autoComplete="off"
                />
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
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
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("courtForm.surface")}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={invalid}
                  placeholder={t("courtForm.surfacePlaceholder")}
                  autoComplete="off"
                />
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="pricePerHour">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("courtForm.price")}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10000}
                  value={String(field.state.value)}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(Math.max(0, Number(e.target.value) || 0))
                  }
                  aria-invalid={invalid}
                />
                {invalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
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
            <Button type="submit" className="rounded-full" disabled={submitting}>
              {mode === "create" ? t("create") : t("save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
