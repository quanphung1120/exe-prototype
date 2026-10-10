"use client"

import { formatVndText } from "@/lib/money"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/pagination"
import { type RoomComplaintRow } from "@/lib/shared"
import { VenuePanel, VenueEmpty, ReasonDialog } from "@/features/venue/shared"
import { useReasonConfirm } from "@/features/admin/use-reason-confirm"
import { resolveComplaint } from "@/features/admin/admin-actions"

const STATUS_VARIANT = {
  open: "default",
  refunded: "secondary",
  dismissed: "outline",
} as const

/** Room-share complaints: members who paid but the host won't let them leave. */
export function AdminComplaintsView({
  complaints,
}: {
  complaints: RoomComplaintRow[]
}) {
  const t = useTranslations("AdminComplaints")
  const pagination = useAdminPagination(complaints.length)
  const refund = useReasonConfirm<RoomComplaintRow>((item, note) =>
    resolveComplaint(item.id, "refund", note)
  )
  const dismiss = useReasonConfirm<RoomComplaintRow>((item, note) =>
    resolveComplaint(item.id, "dismiss", note)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {complaints.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <VenuePanel title={t("title")}>
          <ul className="flex flex-col divide-y divide-border">
            {complaints
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("from", {
                          member: item.memberName,
                          host: item.hostName,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`kind.${item.kind}`)} ·{" "}
                        {t("room", { room: item.roomTitle })} ·{" "}
                        {item.createdAt.slice(8, 10)}/
                        {item.createdAt.slice(5, 7)}/
                        {item.createdAt.slice(0, 4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatVndText(item.amount)}
                      </p>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {t(item.status)}
                      </Badge>
                    </div>
                  </div>
                  <p className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                    {item.reason}
                  </p>
                  {item.adminNote ? (
                    <p className="text-xs text-muted-foreground">
                      {item.adminNote}
                    </p>
                  ) : null}
                  {item.venueViolations ? (
                    <p className="text-xs text-amber-600">
                      {t("violations", { count: item.venueViolations })}
                    </p>
                  ) : null}
                  {item.platformFunded ? (
                    <p className="text-xs text-amber-600">
                      {t("platformFunded")}
                    </p>
                  ) : null}
                  {item.status === "open" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => refund.setTarget(item)}
                      >
                        {t("refund")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => dismiss.setTarget(item)}
                      >
                        {t("dismiss")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </VenuePanel>
      )}

      <AdminPagination pagination={pagination} />

      <ReasonDialog
        {...refund.dialogProps}
        title={t("refundTitle")}
        description={t("refundDescription")}
        reasonLabel={t("noteLabel")}
        reasonPlaceholder={t("notePlaceholder")}
        cancelLabel={t("back")}
        confirmLabel={t("confirm")}
        // Matches the server's ResolveComplaintBodyDto.note @MaxLength(300).
        maxLength={300}
      />
      <ReasonDialog
        {...dismiss.dialogProps}
        title={t("dismissTitle")}
        description={t("dismissDescription")}
        reasonLabel={t("noteLabel")}
        reasonPlaceholder={t("notePlaceholder")}
        cancelLabel={t("back")}
        confirmLabel={t("confirm")}
        maxLength={300}
      />
    </div>
  )
}
