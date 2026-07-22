"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Check, Loader2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useRouter } from "@/i18n/navigation"
import { formatVndFull } from "@/features/dashboard/data"
import { getPaymentStatus } from "@/features/play/payment-actions"

const POLL_MS = 2500
const TIMEOUT_MS = 5 * 60 * 1000

type Phase = "waiting" | "paid" | "cancelled" | "timeout" | "error"

/**
 * Landed on straight after a real SePay checkout (`successUrl` in the API's
 * `PaymentsService#checkout`) — polls `GET /api/payments/by-booking/:id`
 * until the IPN (or that endpoint's own `order.retrieve()` reconciliation)
 * confirms the money moved, since SePay's redirect back here doesn't itself
 * prove payment. The booking's session view (Match Maker/Bookings) already
 * shows "pending" the moment the hold was created — see
 * `session.tsx#reserveHold` — so this page's only job is confirming
 * *payment*, not re-deriving the booking's own status.
 */
export function PaymentReturnView({ bookingId }: { bookingId: string }) {
  const t = useTranslations("PaymentReturn")
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>("waiting")
  const [amount, setAmount] = React.useState<number | null>(null)
  const [originalAmount, setOriginalAmount] = React.useState<number | null>(
    null
  )
  const [discountCode, setDiscountCode] = React.useState<string | null>(null)
  const [discountAmount, setDiscountAmount] = React.useState<number | null>(
    null
  )

  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()

    const tick = async () => {
      const result = await getPaymentStatus(bookingId)
      if (cancelled) return
      if (!result.ok) {
        setPhase("error")
        return
      }
      if (result.data.status === "paid") {
        setAmount(result.data.amount)
        setOriginalAmount(result.data.originalAmount ?? null)
        setDiscountCode(result.data.discountCode ?? null)
        setDiscountAmount(result.data.discountAmount ?? null)
        setPhase("paid")
        return
      }
      if (result.data.status === "cancelled") {
        setPhase("cancelled")
        return
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setPhase("timeout")
        return
      }
      timer = setTimeout(() => void tick(), POLL_MS)
    }

    timer = setTimeout(() => void tick(), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [bookingId])

  const goToBookings = () => router.push("/dashboard/bookings")

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center">
      {phase === "waiting" ? (
        <>
          <Loader2 className="size-10 animate-spin text-brand" />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-xl font-bold tracking-tight">
              {t("waitingTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("waitingBody")}</p>
          </div>
        </>
      ) : phase === "paid" ? (
        <>
          <div className="grid size-14 place-items-center rounded-full bg-brand/15 text-brand">
            <Check className="size-7" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-xl font-bold tracking-tight">
              {t("paidTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {amount != null
                ? t("paidBody", { amount: formatVndFull(amount) })
                : t("paidBodyGeneric")}
            </p>
          </div>
          {originalAmount != null && discountCode && discountAmount != null ? (
            <div className="flex w-full flex-col gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/5 dark:ring-foreground/10">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>{t("subtotal")}</span>
                <span className="tabular-nums line-through">
                  {formatVndFull(originalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>{t("discountApplied", { code: discountCode })}</span>
                <span className="text-brand tabular-nums">
                  −{formatVndFull(discountAmount)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between gap-3 font-semibold text-foreground">
                <span>{t("totalPaid")}</span>
                <span className="tabular-nums">
                  {amount != null ? formatVndFull(amount) : ""}
                </span>
              </div>
            </div>
          ) : null}
          <Button className="rounded-full" onClick={goToBookings}>
            {t("viewBookings")}
          </Button>
        </>
      ) : (
        <>
          <div className="grid size-14 place-items-center rounded-full bg-destructive/12 text-destructive">
            <TriangleAlert className="size-7" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-xl font-bold tracking-tight">
              {t(
                phase === "cancelled"
                  ? "cancelledTitle"
                  : phase === "timeout"
                    ? "timeoutTitle"
                    : "errorTitle"
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                phase === "cancelled"
                  ? "cancelledBody"
                  : phase === "timeout"
                    ? "timeoutBody"
                    : "errorBody"
              )}
            </p>
          </div>
          <Button className="rounded-full" onClick={goToBookings}>
            {t("viewBookings")}
          </Button>
        </>
      )}
    </div>
  )
}
