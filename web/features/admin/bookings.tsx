"use client"

import { useTranslations } from "next-intl"

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
import { VenueEmpty, ReasonDialog } from "@/features/venue/shared"
import { useReasonConfirm } from "@/features/admin/use-reason-confirm"
import { forceCancelBooking } from "@/features/admin/admin-actions"
import type { AdminBookingRow } from "@/features/admin/admin-types"

const CANCELLABLE = new Set(["pending", "confirmed", "checked-in"])

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  awaiting_payment: "outline",
  pending: "outline",
  confirmed: "secondary",
  "checked-in": "secondary",
  completed: "default",
  expired: "outline",
  cancelled: "destructive",
  "no-show": "destructive",
}

const PAYMENT_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  awaiting: "outline",
  paid: "secondary",
  refunded: "destructive",
  partial_refund: "destructive",
  none: "outline",
}

export function AdminBookingsView({
  bookings,
}: {
  bookings: AdminBookingRow[]
}) {
  const t = useTranslations("AdminBookings")
  const { setTarget, dialogProps } = useReasonConfirm<AdminBookingRow>(
    (booking, reason) => forceCancelBooking(booking.bookingId, reason)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { count: bookings.length })}
        </p>
      </div>

      {bookings.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.booking")}</TableHead>
              <TableHead>{t("table.venue")}</TableHead>
              <TableHead>{t("table.court")}</TableHead>
              <TableHead>{t("table.when")}</TableHead>
              <TableHead className="text-right">{t("table.price")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.payment")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.bookingId}>
                <TableCell className="font-mono text-xs">
                  {b.bookingId}
                </TableCell>
                <TableCell>{b.venueId}</TableCell>
                <TableCell>{b.courtName}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {b.dateKey} · {b.start}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatVnd(b.price)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[b.status] ?? "outline"}>
                    {t(`status.${b.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={PAYMENT_VARIANT[b.paymentStatus] ?? "outline"}
                  >
                    {t(`paymentStatus.${b.paymentStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {CANCELLABLE.has(b.status) ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
                      onClick={() => setTarget(b)}
                    >
                      {t("cancel.button")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ReasonDialog
        {...dialogProps}
        title={t("cancel.title")}
        description={t("cancel.description")}
        reasonLabel={t("cancel.reasonLabel")}
        reasonPlaceholder={t("cancel.reasonPlaceholder")}
        cancelLabel={t("cancel.cancel")}
        confirmLabel={t("cancel.confirm")}
      />
    </div>
  )
}
