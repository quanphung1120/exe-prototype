"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { VenueEmpty, ReasonDialog } from "@/features/venue/shared"
import { useReasonConfirm } from "@/features/admin/use-reason-confirm"
import { approveVenue, rejectVenue } from "@/features/admin/admin-actions"
import type { AdminApprovalRow } from "@/features/admin/admin-types"

export function AdminApprovalsView({ venues }: { venues: AdminApprovalRow[] }) {
  const t = useTranslations("AdminApprovals")
  const [rows, setRows] = React.useState(venues)
  const [pending, setPending] = React.useState<string | null>(null)

  const { setTarget, dialogProps } = useReasonConfirm<AdminApprovalRow>(
    (venue, reason) => rejectVenue(venue.id, reason),
    (venue) => setRows((current) => current.filter((v) => v.id !== venue.id))
  )

  const handleApprove = async (venue: AdminApprovalRow) => {
    setPending(venue.id)
    try {
      await approveVenue(venue.id)
      setRows((current) => current.filter((v) => v.id !== venue.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.venue")}</TableHead>
              <TableHead>{t("table.district")}</TableHead>
              <TableHead>{t("table.city")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((venue) => (
              <TableRow key={venue.id}>
                <TableCell className="font-medium">{venue.name}</TableCell>
                <TableCell>{venue.district}</TableCell>
                <TableCell>{venue.city}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={pending === venue.id}
                      onClick={() => void handleApprove(venue)}
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
                      disabled={pending === venue.id}
                      onClick={() => setTarget(venue)}
                    >
                      {t("reject.button")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ReasonDialog
        {...dialogProps}
        title={t("reject.title")}
        description={t("reject.description")}
        reasonLabel={t("reject.reasonLabel")}
        reasonPlaceholder={t("reject.reasonPlaceholder")}
        cancelLabel={t("reject.cancel")}
        confirmLabel={t("reject.confirm")}
      />
    </div>
  )
}
