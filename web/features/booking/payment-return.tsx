"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Link, useRouter } from "@/i18n/navigation"
import { openVenueChat } from "@/features/chat/stream-actions"
import { formatVndFull } from "@/features/dashboard/data"
import { getPaymentStatus } from "@/features/play/payment-actions"
import { useSession } from "@/features/play/session"

const POLL_MS = 2500
const TIMEOUT_MS = 5 * 60 * 1000

type Phase = "waiting" | "paid" | "failed" | "cancelled" | "timeout" | "error"

/** Which SePay return URL brought the player here (see api `return-urls.ts`). */
export type PaymentOutcome = "success" | "failed"
/** Why SePay sent the player to the failed page. */
export type PaymentFailReason = "error" | "cancelled"

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
export function PaymentReturnView({
  bookingId,
  outcome = "success",
  reason = "error",
}: {
  bookingId: string
  outcome?: PaymentOutcome
  reason?: PaymentFailReason
}) {
  const t = useTranslations("PaymentReturn")
  const tb = useTranslations("Bookings")
  const router = useRouter()
  const { markPaymentPaid, bookings, resumePayment, resumingPaymentId } =
    useSession()
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
        // The API has already settled the payment and moved the booking to
        // pending approval. Update the persistent client provider immediately
        // so navigating to Bookings cannot briefly show the pre-payment state
        // while the dashboard seed is being refreshed.
        markPaymentPaid(bookingId)
        setAmount(result.data.amount)
        setOriginalAmount(result.data.originalAmount ?? null)
        setDiscountCode(result.data.discountCode ?? null)
        setDiscountAmount(result.data.discountAmount ?? null)
        setPhase("paid")
        return
      }
      // SePay's error/cancel redirect: the money didn't move. Check once (the
      // IPN may still have settled it — handled above), then show the failure
      // straight away instead of polling for a payment that isn't coming.
      if (outcome === "failed") {
        setPhase("failed")
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
  }, [bookingId, markPaymentPaid, outcome])

  const goToBookings = () => router.push("/app/bookings")

  const [opening, startOpening] = React.useTransition()
  const messageVenue = () => {
    startOpening(async () => {
      try {
        const { id } = await openVenueChat({ bookingId })
        router.push(`/app/chat?channel=${id}`)
      } catch {
        toast.error(t("messageVenueFailed"))
      }
    })
  }

  // The booking this payment settles, when the session already knows it —
  // shown as a receipt (venue · court · day · time). Optional: the page
  // works from the payment status alone.
  const booking = bookings.find(
    (b) => b.id === bookingId || b.reservationId === bookingId
  )
  const courtNo = booking?.court.match(/^Court (\d+)$/)?.[1]
  const courtLabel = booking
    ? courtNo
      ? tb("courtLabel", { n: courtNo })
      : booking.court
    : null

  const failed =
    phase === "failed" ||
    phase === "cancelled" ||
    phase === "timeout" ||
    phase === "error"
  const failKey =
    phase === "failed"
      ? reason === "cancelled"
        ? "userCancelled"
        : "failed"
      : phase === "cancelled"
        ? "cancelled"
        : phase === "timeout"
          ? "timeout"
          : "error"
  const retrying = resumingPaymentId === bookingId

  return (
    <div className="player-play flex min-h-full items-start justify-center bg-[#f6f9ff] px-4 py-8 text-[#0b1224] sm:items-center sm:py-12">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="overflow-hidden rounded-[32px] border border-[#eaf0fc] bg-white shadow-[0_10px_40px_#1420500f]">
          {/* Status hero */}
          <div
            className={cn(
              "relative isolate flex flex-col items-center gap-4 overflow-hidden px-6 pt-9 pb-7 text-center",
              phase === "paid"
                ? "bg-[#2046ed] text-white"
                : failed
                  ? "bg-[#fff7ed]"
                  : "bg-[#f4f7fc]"
            )}
          >
            {phase === "paid" ? (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-14 -right-14 -z-10 size-44 rounded-full border-[20px] border-[#a5ff12]/20"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -left-10 -z-10 size-40 rounded-full bg-white/5"
                />
              </>
            ) : null}

            <span
              className={cn(
                "grid size-16 place-items-center rounded-full",
                phase === "paid"
                  ? "bg-[#a5ff12] text-[#173bc8] shadow-[0_0_0_8px_#a5ff1233]"
                  : failed
                    ? "bg-[#ffedd5] text-[#c2410c]"
                    : "bg-white text-brand shadow-[0_0_0_8px_#2046ed14]"
              )}
            >
              {phase === "waiting" ? (
                <Loader2 className="size-8 animate-spin" />
              ) : phase === "paid" ? (
                <Check className="size-8" strokeWidth={3} />
              ) : (
                <TriangleAlert className="size-8" />
              )}
            </span>

            <div className="flex flex-col gap-1.5">
              <h1 className="font-heading text-2xl font-black tracking-tight">
                {phase === "waiting"
                  ? t("waitingTitle")
                  : phase === "paid"
                    ? t("paidTitle")
                    : t(`${failKey}Title`)}
              </h1>
              <p
                className={cn(
                  "text-sm leading-relaxed",
                  phase === "paid" ? "text-white/80" : "text-muted-foreground"
                )}
              >
                {phase === "waiting"
                  ? t("waitingBody")
                  : phase === "paid"
                    ? t("paidBodyGeneric")
                    : t(`${failKey}Body`)}
              </p>
            </div>

            {phase === "paid" && amount != null ? (
              <p className="font-heading text-4xl font-black text-[#a5ff12] tabular-nums">
                {formatVndFull(amount)}
              </p>
            ) : null}
          </div>

          {/* Receipt — booking details + discount breakdown */}
          {phase === "paid" ? (
            <div className="flex flex-col gap-4 px-6 py-5">
              {booking ? (
                <div className="flex flex-col gap-2">
                  <p className="font-heading text-base leading-snug font-black">
                    {booking.venue}
                  </p>
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {courtLabel ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0 text-brand" />
                        {courtLabel}
                      </span>
                    ) : null}
                    {booking.dayKey ? (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 shrink-0 text-brand" />
                        <span className="tabular-nums">
                          {booking.dayKey.split("-").reverse().join("/")}
                        </span>
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0 text-brand" />
                      <span className="tabular-nums">{booking.time}</span>
                    </span>
                  </div>
                </div>
              ) : null}

              {originalAmount != null &&
              discountCode &&
              discountAmount != null ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-[#f6f9ff] px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span>{t("subtotal")}</span>
                    <span className="tabular-nums line-through">
                      {formatVndFull(originalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span>{t("discountApplied", { code: discountCode })}</span>
                    <span className="font-semibold text-[#16a34a] tabular-nums">
                      −{formatVndFull(discountAmount)}
                    </span>
                  </div>
                  <div className="border-t border-dashed border-[#d6e0f7]" />
                  <div className="flex items-center justify-between gap-3 font-bold">
                    <span>{t("totalPaid")}</span>
                    <span className="text-brand tabular-nums">
                      {amount != null ? formatVndFull(amount) : ""}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#e3eafa] pt-3 text-[11px] text-muted-foreground">
                <span>{t("bookingRef")}</span>
                <span className="truncate font-mono font-semibold tracking-wide text-[#0b1224] uppercase">
                  {bookingId}
                </span>
              </div>
            </div>
          ) : null}

          {/* Actions */}
          {phase !== "waiting" ? (
            <div className="flex flex-col gap-2 px-6 pb-6 sm:flex-row">
              {phase === "failed" ? (
                <Button
                  className="h-11 flex-1 rounded-full bg-[#2046ed] font-bold text-white hover:bg-[#173bc8]"
                  disabled={retrying}
                  onClick={() => resumePayment(bookingId)}
                >
                  {retrying ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CreditCard />
                  )}
                  {retrying ? t("openingPayment") : t("retryPayment")}
                </Button>
              ) : null}
              <Button
                className={cn(
                  "h-11 flex-1 rounded-full font-bold",
                  phase === "failed"
                    ? "border-2 border-lime bg-white text-brand hover:bg-lime/30"
                    : "bg-lime text-lime-foreground hover:bg-lime/90"
                )}
                onClick={goToBookings}
              >
                <CalendarDays />
                {t("viewBookings")}
              </Button>
              {phase === "paid" ? (
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-full border-2 border-lime bg-white font-bold text-brand hover:bg-lime/30 hover:text-brand"
                  disabled={opening}
                  onClick={messageVenue}
                >
                  {opening ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <MessageSquare />
                  )}
                  {t("messageVenue")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-1.5 self-center rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          {t("backHome")}
        </Link>
      </div>
    </div>
  )
}
