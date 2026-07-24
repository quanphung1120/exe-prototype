"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { LayoutGrid, MoreVertical, Pencil, Plus, Wrench } from "lucide-react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  SPORTS,
  courtStateAccent,
  formatVnd,
  type CourtState,
  type SportKey,
  type VenueCourt,
} from "@/features/venue/data"
import { useVenueData } from "@/features/venue/venue-data-provider"
import {
  addCourt,
  deleteCourt,
  updateCourt,
  type CourtInput,
} from "@/features/venue/venue-actions"
import { SportTag } from "@/features/dashboard/shared"
import { VenueEmpty, VenuePanel } from "@/features/venue/shared"

const COURT_STATES: CourtState[] = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
]

interface CourtDraft {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state: CourtState
}

function draftFromCourt(court: VenueCourt): CourtDraft {
  return {
    name: court.name,
    sport: court.sport,
    surface: court.surface,
    pricePerHour: court.pricePerHour,
    state: court.state,
  }
}

function emptyDraft(defaultSport: SportKey): CourtDraft {
  return {
    name: "",
    sport: defaultSport,
    surface: "",
    pricePerHour: 300000,
    state: "available",
  }
}

export function VenueCourtsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const t = useTranslations("VenueCourts")
  const { venueId, venueCourts } = useVenueData()

  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [editingCourt, setEditingCourt] = React.useState<VenueCourt | null>(
    null
  )
  const [archiveTarget, setArchiveTarget] = React.useState<VenueCourt | null>(
    null
  )
  const [isPending, startTransition] = React.useTransition()

  const courts = React.useMemo(
    () => venueCourts.filter((court) => !court.archived),
    [venueCourts]
  )

  const stateLabel: Record<CourtState, string> = {
    available: t("state.available"),
    "in-play": t("state.inPlay"),
    upcoming: t("state.upcoming"),
    maintenance: t("state.maintenance"),
  }

  const openAddDialog = React.useCallback(() => {
    setEditingCourt(null)
    setIsFormOpen(true)
  }, [])

  const openEditDialog = React.useCallback((court: VenueCourt) => {
    setEditingCourt(court)
    setIsFormOpen(true)
  }, [])

  const closeFormDialog = React.useCallback(() => {
    setIsFormOpen(false)
    setEditingCourt(null)
  }, [])

  const handleSubmit = React.useCallback(
    (draft: CourtDraft) => {
      const input: CourtInput = {
        name: draft.name,
        sport: draft.sport,
        surface: draft.surface,
        pricePerHour: draft.pricePerHour,
        state: draft.state,
      }
      startTransition(async () => {
        try {
          if (editingCourt) {
            await updateCourt(venueId, editingCourt.id, input)
            toast.success(t("toasts.updated"))
          } else {
            await addCourt(venueId, input)
            toast.success(t("toasts.added"))
          }
          closeFormDialog()
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : t("toasts.saveError")
          )
        }
      })
    },
    [editingCourt, venueId, closeFormDialog, t]
  )

  const handleArchive = React.useCallback(() => {
    if (!archiveTarget) return
    const court = archiveTarget
    startTransition(async () => {
      try {
        await deleteCourt(venueId, court.id)
        toast.success(t("toasts.archived", { name: court.name }))
        setArchiveTarget(null)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("toasts.archiveError")
        )
      }
    })
  }, [archiveTarget, venueId, t])

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      ) : null}

      <VenuePanel
        title={t("listTitle")}
        icon={LayoutGrid}
        action={
          <Button size="sm" onClick={openAddDialog} className="rounded-full">
            <Plus className="mr-1 size-4" />
            {t("addButton")}
          </Button>
        }
      >
        {courts.length ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 px-4 py-2">
                    {t("col.name")}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {t("col.sport")}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {t("col.surface")}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2 text-right">
                    {t("col.price")}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {t("col.state")}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    <span className="sr-only">{t("col.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courts.map((court) => (
                  <TableRow key={court.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3 align-middle font-medium text-foreground">
                      {court.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle">
                      <SportTag sport={court.sport} />
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle text-sm text-muted-foreground">
                      {court.surface || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-middle font-heading text-sm font-semibold text-foreground tabular-nums">
                      {formatVnd(court.pricePerHour)}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          courtStateAccent[court.state]
                        )}
                      >
                        {court.state === "maintenance" ? (
                          <Wrench className="size-3" />
                        ) : null}
                        {stateLabel[court.state]}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-middle">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="rounded-full text-muted-foreground"
                              aria-label={t("rowActions")}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openEditDialog(court)}
                          >
                            <Pencil />
                            {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setArchiveTarget(court)}
                          >
                            {t("archive")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <VenueEmpty text={t("empty")} />
        )}
      </VenuePanel>

      {isFormOpen ? (
        <CourtFormDialog
          court={editingCourt}
          isPending={isPending}
          onClose={closeFormDialog}
          onSubmit={handleSubmit}
        />
      ) : null}

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("archiveDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("archiveDialog.description", {
                name: archiveTarget?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={isPending}
            >
              {t("archiveDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleArchive}
            >
              {isPending
                ? t("archiveDialog.pending")
                : t("archiveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CourtFormDialogProps {
  court: VenueCourt | null
  isPending: boolean
  onClose: () => void
  onSubmit: (draft: CourtDraft) => void
}

/**
 * Only ever mounted by the parent while it should be open (see
 * `VenueCourtsView`'s `isFormOpen ? <CourtFormDialog ... /> : null`), so the
 * draft's `useState` initializer — evaluated once per mount — is always fresh
 * for the court being added/edited. That sidesteps re-seeding the draft from
 * an effect (disallowed by this repo's eslint config, see CLAUDE.md).
 */
function CourtFormDialog({
  court,
  isPending,
  onClose,
  onSubmit,
}: CourtFormDialogProps) {
  const t = useTranslations("VenueCourts")
  const tc = useTranslations("Common")
  const isEditing = court !== null
  const [draft, setDraft] = React.useState<CourtDraft>(() =>
    court ? draftFromCourt(court) : emptyDraft(SPORTS[0]?.key ?? "badminton")
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (draft.name.trim().length < 1) return
    onSubmit({ ...draft, name: draft.name.trim() })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editDialog.title") : t("addDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("editDialog.description")
              : t("addDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="court-name">{t("form.name")}</FieldLabel>
            <Input
              id="court-name"
              required
              autoComplete="off"
              value={draft.name}
              placeholder={t("form.namePlaceholder")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("form.sport")}</FieldLabel>
              <Select
                value={draft.sport}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, sport: v as SportKey }))
                }
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
            <Field>
              <FieldLabel>{t("form.state")}</FieldLabel>
              <Select
                value={draft.state}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, state: v as CourtState }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => t(`state.${stateKey(v as CourtState)}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COURT_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`state.${stateKey(s)}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="court-surface">
                {t("form.surface")}
              </FieldLabel>
              <Input
                id="court-surface"
                autoComplete="off"
                value={draft.surface}
                placeholder={t("form.surfacePlaceholder")}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, surface: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="court-price">{t("form.price")}</FieldLabel>
              <Input
                id="court-price"
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
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("form.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || draft.name.trim().length < 1}
            >
              {isPending ? t("form.saving") : t("form.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Maps a `CourtState` to its `state.*` i18n key (the one non-slug case is `in-play` → `inPlay`). */
function stateKey(
  state: CourtState
): "available" | "inPlay" | "upcoming" | "maintenance" {
  return state === "in-play" ? "inPlay" : state
}
