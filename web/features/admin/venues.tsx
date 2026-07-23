"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { restoreVenue, suspendVenue } from "@/features/admin/admin-actions"
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

  const handleSuspend = async (venue: AdminVenueRow) => {
    setPending(venue.id)
    try {
      await suspendVenue(venue.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setPending(null)
    }
  }

  const handleRestore = async (venue: AdminVenueRow) => {
    setPending(venue.id)
    try {
      await restoreVenue(venue.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setPending(null)
    }
  }

  const totalVenues = groups.reduce((n, g) => n + g.venues.length, 0)

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
        groups.map((group, i) => (
          <VenuePanel
            key={group.brand?.id ?? `ownerless-${i}`}
            title={group.brand?.name ?? t("noBrand")}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.venue")}</TableHead>
                  <TableHead>{t("table.district")}</TableHead>
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
                    <TableCell className="font-medium">
                      {venue.name}
                    </TableCell>
                    <TableCell>{venue.district}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          APPROVAL_VARIANT[venue.approval ?? "approved"]
                        }
                      >
                        {t(`approval.${venue.approval ?? "approved"}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={venue.archived ? "outline" : "secondary"}>
                        {t(venue.archived ? "status.archived" : "status.active")}
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
                          onClick={() => void handleRestore(venue)}
                        >
                          {t("restore")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-full"
                          disabled={pending === venue.id}
                          onClick={() => void handleSuspend(venue)}
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
    </div>
  )
}
