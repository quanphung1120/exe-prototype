"use client"

import { formatVndText } from "@/lib/money"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/pagination"
import { type WithdrawalRow } from "@/lib/shared"
import { VenuePanel, VenueEmpty, ReasonDialog } from "@/features/venue/shared"
import { useReasonConfirm } from "@/features/admin/use-reason-confirm"
import {
  completeWithdrawal,
  rejectWithdrawal,
} from "@/features/admin/admin-actions"

const STATUS_VARIANT = {
  pending: "default",
  completed: "secondary",
  rejected: "outline",
} as const

/** Wallet withdrawals awaiting a manual bank transfer. */
export function AdminWithdrawalsView({
  withdrawals,
}: {
  withdrawals: WithdrawalRow[]
}) {
  const t = useTranslations("AdminWithdrawals")
  const pagination = useAdminPagination(withdrawals.length)
  const complete = useReasonConfirm<WithdrawalRow>((item, ref) =>
    completeWithdrawal(item.id, ref)
  )
  const reject = useReasonConfirm<WithdrawalRow>((item, note) =>
    rejectWithdrawal(item.id, note)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {withdrawals.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <VenuePanel title={t("title")}>
          <ul className="flex flex-col divide-y divide-border">
            {withdrawals
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatVndText(item.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.requestedAt.slice(8, 10)}/
                        {item.requestedAt.slice(5, 7)}/
                        {item.requestedAt.slice(0, 4)} ·{" "}
                        {item.requestedAt.slice(11, 16)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[item.status]}>
                      {t(item.status)}
                    </Badge>
                  </div>
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                    <p className="font-medium">{item.accountHolder}</p>
                    <p className="text-muted-foreground">
                      {item.bankName} · {item.accountNumber}
                    </p>
                  </div>
                  {item.ref ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ref", { ref: item.ref })}
                    </p>
                  ) : null}
                  {item.adminNote ? (
                    <p className="text-xs text-destructive">{item.adminNote}</p>
                  ) : null}
                  {item.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => complete.setTarget(item)}
                      >
                        {t("complete")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => reject.setTarget(item)}
                      >
                        {t("reject")}
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
        {...complete.dialogProps}
        title={t("completeTitle")}
        description={t("completeDescription")}
        reasonLabel={t("refLabel")}
        reasonPlaceholder={t("refPlaceholder")}
        cancelLabel={t("back")}
        confirmLabel={t("confirm")}
        // Matches the server's CompleteWithdrawalDto.ref @MaxLength(120).
        maxLength={120}
      />
      <ReasonDialog
        {...reject.dialogProps}
        title={t("rejectTitle")}
        description={t("rejectDescription")}
        reasonLabel={t("noteLabel")}
        reasonPlaceholder={t("notePlaceholder")}
        cancelLabel={t("back")}
        confirmLabel={t("confirm")}
        maxLength={300}
      />
    </div>
  )
}
