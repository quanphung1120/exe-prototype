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
import { approveBrand, rejectBrand } from "@/features/admin/admin-actions"
import type { AdminApprovalRow } from "@/features/admin/admin-types"

// Approval is decided per BRAND (thương hiệu): approving one unblocks every
// branch under it, current and future — so each row here is a brand, with its
// branches listed for context.
export function AdminApprovalsView({ brands }: { brands: AdminApprovalRow[] }) {
  const t = useTranslations("AdminApprovals")
  const [rows, setRows] = React.useState(brands)
  const [pending, setPending] = React.useState<string | null>(null)

  const { setTarget, dialogProps } = useReasonConfirm<AdminApprovalRow>(
    (row, reason) => rejectBrand(row.brand.id, reason),
    (row) =>
      setRows((current) => current.filter((r) => r.brand.id !== row.brand.id))
  )

  const handleApprove = async (row: AdminApprovalRow) => {
    setPending(row.brand.id)
    try {
      await approveBrand(row.brand.id)
      setRows((current) => current.filter((r) => r.brand.id !== row.brand.id))
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
              <TableHead>{t("table.brand")}</TableHead>
              <TableHead>{t("table.branches")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.brand.id}>
                <TableCell className="align-top font-medium">
                  {row.brand.name}
                </TableCell>
                <TableCell>
                  {row.venues.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {row.venues.map((venue) => (
                        <span key={venue.id} className="text-sm">
                          {venue.name}
                          <span className="text-muted-foreground">
                            {" · "}
                            {venue.ward}, {venue.province}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right align-top">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={pending === row.brand.id}
                      onClick={() => void handleApprove(row)}
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
                      disabled={pending === row.brand.id}
                      onClick={() => setTarget(row)}
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
