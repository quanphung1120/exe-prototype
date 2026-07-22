"use client"

import { useLocale, useTranslations } from "next-intl"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatVnd, locStr } from "@/lib/shared"
import { VenuePanel, VenueEmpty, ReasonDialog } from "@/features/venue/shared"
import { useReasonConfirm } from "@/features/admin/use-reason-confirm"
import { settleRefund } from "@/features/admin/admin-actions"
import type { AdminRefundRow } from "@/features/admin/admin-types"

export function AdminRefundsView({ refunds }: { refunds: AdminRefundRow[] }) {
  const t = useTranslations("AdminRefunds")
  const locale = useLocale()
  const { setTarget, dialogProps } = useReasonConfirm<AdminRefundRow>(
    (item, ref) => settleRefund(item.bookingId, ref)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {refunds.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <VenuePanel title={t("title")}>
          <ul className="flex flex-col divide-y divide-border">
            {refunds.map((item) => (
              <li
                key={item.bookingId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {item.customer.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.customer.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.venueId} · {item.court} · {locStr(item.day, locale)}{" "}
                      · {item.time}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {formatVnd(item.refund.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("pct", { pct: item.refund.pct })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setTarget(item)}
                  >
                    {t("settle.button")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </VenuePanel>
      )}

      <ReasonDialog
        {...dialogProps}
        title={t("settle.title")}
        description={t("settle.description")}
        reasonLabel={t("settle.refLabel")}
        reasonPlaceholder={t("settle.refPlaceholder")}
        cancelLabel={t("settle.cancel")}
        confirmLabel={t("settle.confirm")}
        // Matches the server's SettleRefundDto.ref @MaxLength(120).
        maxLength={120}
      />
    </div>
  )
}
