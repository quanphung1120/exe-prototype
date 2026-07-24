"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { AlertTriangle, ArchiveRestore } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  courtStateAccent,
  type BranchSummary,
  type CourtState,
} from "@/features/venue/data"
import { VenuePanel } from "@/features/venue/shared"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { venueBase } from "@/features/venue/nav"
import { archiveVenue, restoreVenue } from "@/features/venue/venue-actions"
import { Link, useRouter } from "@/i18n/navigation"

const APPROVAL_VARIANT = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
} as const

const COURT_STATES: CourtState[] = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
]

/**
 * The venue "manage" screen — reached from the workspace switcher (sidebar
 * header dropdown), not the persistent nav (kept at 4 tabs, see
 * `nav-simplification`). Scoped to this branch (chi nhánh): archive/restore
 * (VienTD-Review decision #11). An archived branch stays under the brand and
 * keeps appearing in the switcher, so restoring here — instead of running
 * setup again — is the way back. It's also the HUB for the whole brand: the
 * cross-branch overview table (plan 021) is the only place an operator sees
 * every branch's court count/status at once, since every other screen is
 * scoped to one branch via the `[venueId]` URL segment.
 */
export function VenueManageView({ branches }: { branches: BranchSummary[] }) {
  const t = useTranslations("VenueManage")
  const router = useRouter()
  const { venueId, venue: VENUE } = useVenueData()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  const stateLabel: Record<CourtState, string> = {
    available: t("overview.states.available"),
    "in-play": t("overview.states.inPlay"),
    upcoming: t("overview.states.upcoming"),
    maintenance: t("overview.states.maintenance"),
  }

  const goToReservations = React.useCallback(() => {
    router.push(`${venueBase(venueId)}/schedule?tab=reservations`)
  }, [router, venueId])

  const handleArchive = () => {
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await archiveVenue(venueId)
        toast.success(t("archiveVenue.done", { name: VENUE.name }))
      } catch (error) {
        const message = error instanceof Error ? error.message : t("error")
        // A 409 means a pending/confirmed booking still sits in the future —
        // point the operator at the reservations screen to clear it first
        // instead of just failing silently.
        toast.error(message, {
          action: {
            label: t("archiveVenue.viewReservations"),
            onClick: goToReservations,
          },
        })
      }
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      try {
        await restoreVenue(venueId)
        toast.success(t("restoreVenue.done", { name: VENUE.name }))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("error"))
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("manageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("manageSubtitle")}
        </p>
      </div>

      <VenuePanel title={t("overview.title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("overview.subtitle")}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.colBranch")}</TableHead>
              <TableHead>{t("overview.colArea")}</TableHead>
              <TableHead className="text-right">
                {t("overview.colCourts")}
              </TableHead>
              <TableHead>{t("overview.colStates")}</TableHead>
              <TableHead>{t("overview.colApproval")}</TableHead>
              <TableHead className="text-right">
                {t("overview.colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((b) => (
              <TableRow
                key={b.venueId}
                className={cn(b.venueId === venueId && "bg-brand/5")}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {b.name}
                    {b.venueId === venueId ? (
                      <Badge variant="secondary">{t("overview.current")}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {b.ward} · {b.province}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.courtCount}
                </TableCell>
                <TableCell>
                  {b.courtCount === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t("overview.empty")}
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {COURT_STATES.filter(
                        (state) => b.stateCounts[state] > 0
                      ).map((state) => (
                        <span
                          key={state}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            courtStateAccent[state]
                          )}
                        >
                          {b.stateCounts[state]} {stateLabel[state]}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={APPROVAL_VARIANT[b.approval ?? "approved"]}>
                    {t(`overview.approval.${b.approval ?? "approved"}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    render={<Link href={`${venueBase(b.venueId)}/courts`} />}
                  >
                    {t("overview.manage")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </VenuePanel>

      {VENUE.archived ? (
        <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-amber-500/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-heading text-sm font-semibold">
                {t("archivedBanner.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("archivedBanner.description")}
              </p>
            </div>
          </div>
          <Button
            onClick={handleRestore}
            disabled={isPending}
            className="shrink-0 rounded-full"
          >
            <ArchiveRestore />
            {isPending ? t("restoreVenue.pending") : t("restoreVenue.button")}
          </Button>
        </div>
      ) : (
        <VenuePanel title={t("dangerZone.title")} icon={AlertTriangle}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {t("dangerZone.archiveLabel")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dangerZone.archiveDescription")}
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0 rounded-full"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {t("archive")}
            </Button>
          </div>
        </VenuePanel>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("archiveVenue.title")}</DialogTitle>
            <DialogDescription>
              {t("archiveVenue.description", { name: VENUE.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleArchive}
            >
              {isPending
                ? t("archiveVenue.pending")
                : t("archiveVenue.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
