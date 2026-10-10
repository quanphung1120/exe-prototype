"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatVnd } from "@/lib/shared"
import { VenuePanel, VenueEmpty } from "@/features/venue/shared"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  removeVenueOwner,
  restoreVenue,
  suspendVenue,
  type AdminActionResult,
} from "@/features/admin/admin-actions"
import { ContactPhone } from "@/features/admin/contact-phone"
import type {
  AdminBrandGroup,
  AdminVenueRow,
} from "@/features/admin/admin-types"

const APPROVAL_VARIANT = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
} as const

export function AdminVenuesView({ groups }: { groups: AdminBrandGroup[] }) {
  const t = useTranslations("AdminVenues")
  const [pending, setPending] = React.useState<string | null>(null)

  const [removing, setRemoving] = React.useState<{
    ownerId: string
    name: string
  } | null>(null)

  // The server actions return a result object (a thrown error's message is
  // redacted in production), so the reason — e.g. "still has future
  // bookings" — reaches the toast.
  const run = async (
    id: string,
    action: () => Promise<AdminActionResult>,
    success?: string
  ) => {
    setPending(id)
    try {
      const result = await action()
      if (result.ok) {
        if (success) toast.success(success)
      } else {
        toast.error(result.message)
      }
      return result.ok
    } catch {
      toast.error("Request failed")
      return false
    } finally {
      setPending(null)
    }
  }

  const handleSuspend = (venue: AdminVenueRow) =>
    void run(venue.id, () => suspendVenue(venue.id))

  const handleRestore = (venue: AdminVenueRow) =>
    void run(venue.id, () => restoreVenue(venue.id))

  const confirmRemove = async () => {
    if (!removing) return
    const ok = await run(
      removing.ownerId,
      () => removeVenueOwner(removing.ownerId),
      t("removeOwner.done")
    )
    if (ok) setRemoving(null)
  }

  const totalVenues = groups.reduce((n, g) => n + g.venues.length, 0)
  const pagination = useAdminPagination(totalVenues)
  let groupOffset = 0
  const visibleGroups = groups.flatMap((group, index) => {
    const start = groupOffset
    groupOffset += group.venues.length
    const venues = group.venues.slice(
      Math.max(0, pagination.offset - start),
      Math.max(0, pagination.offset + pagination.pageSize - start)
    )
    return venues.length
      ? [{ ...group, venues, key: group.brand?.id ?? `ownerless-${index}` }]
      : []
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {totalVenues === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        visibleGroups.map((group) => (
          <VenuePanel
            key={group.key}
            title={group.brand?.name ?? t("noBrand")}
            action={
              group.brand ? (
                <div className="flex items-center gap-3">
                  <ContactPhone
                    phone={group.brand.contactPhone}
                    emptyLabel={t("noPhone")}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-full"
                    disabled={pending === group.brand.ownerId}
                    onClick={() =>
                      setRemoving({
                        ownerId: group.brand!.ownerId,
                        name: group.brand!.name,
                      })
                    }
                  >
                    {t("removeOwner.button")}
                  </Button>
                </div>
              ) : null
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.venue")}</TableHead>
                  <TableHead>{t("table.ward")}</TableHead>
                  <TableHead>{t("table.approval")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.bookings")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.revenue")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.venues.map((venue) => (
                  <TableRow key={venue.id}>
                    <TableCell className="font-medium">{venue.name}</TableCell>
                    <TableCell>{venue.ward}</TableCell>
                    <TableCell>
                      <Badge
                        variant={APPROVAL_VARIANT[venue.approval ?? "approved"]}
                      >
                        {t(`approval.${venue.approval ?? "approved"}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={venue.archived ? "outline" : "secondary"}>
                        {t(
                          venue.archived ? "status.archived" : "status.active"
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {venue.bookings}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(venue.revenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {venue.archived ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={pending === venue.id}
                          onClick={() => handleRestore(venue)}
                        >
                          {t("restore")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-full"
                          disabled={pending === venue.id}
                          onClick={() => handleSuspend(venue)}
                        >
                          {t("suspend")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </VenuePanel>
        ))
      )}
      <AdminPagination pagination={pagination} />
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeOwner.title", { name: removing?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeOwner.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>
              {t("removeOwner.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending !== null}
              onClick={() => void confirmRemove()}
            >
              {t("removeOwner.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
