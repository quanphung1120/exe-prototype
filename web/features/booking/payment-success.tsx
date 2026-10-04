"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useLocale } from "next-intl"

import { useRouter } from "@/i18n/navigation"
import { readPreferredLocale } from "@/lib/locale-preference"
import {
  PaymentReturnView,
  type PaymentFailReason,
  type PaymentOutcome,
} from "@/features/booking/payment-return"

/**
 * Landed on straight after a real SePay checkout — the API's
 * `PaymentsService#checkout` points SePay's `success_url` at
 * `/app/payment/success/<bookingId>` and its `error_url`/`cancel_url` at
 * `/app/payment/failed/<bookingId>?reason=…` (see api `return-urls.ts`).
 * Those return URLs are static, so SePay always brings the player back in the
 * default locale (`vi`). Before rendering the result, we read the locale the
 * player was actually on — stashed in `localStorage` right before the redirect
 * (see `savePreferredLocale` in `session.tsx#pay`) — and, if it differs from
 * the URL's, replace to the matching prefix (keeping the same return path) so
 * the whole return experience stays in their language. Only then does
 * {@link PaymentReturnView} take over.
 */
export function PaymentReturnPage({
  bookingId,
  outcome,
  reason,
}: {
  bookingId: string
  outcome: PaymentOutcome
  reason?: PaymentFailReason
}) {
  const locale = useLocale()
  const router = useRouter()
  // `null` until the client has decided; `false` means "stay here and render".
  const [redirecting, setRedirecting] = React.useState<boolean | null>(null)

  // Deferred a tick so the synchronous state update never fires inside the
  // effect body (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    const id = setTimeout(() => {
      const preferred = readPreferredLocale()
      if (preferred && preferred !== locale) {
        setRedirecting(true)
        const path =
          outcome === "success"
            ? `/app/payment/success/${bookingId}`
            : `/app/payment/failed/${bookingId}?reason=${reason ?? "error"}`
        router.replace(path, { locale: preferred })
      } else {
        setRedirecting(false)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [bookingId, locale, outcome, reason, router])

  // While deciding (or mid-redirect), show a spinner rather than flashing the
  // wrong-locale payment screen for a frame.
  if (redirecting !== false) {
    return (
      <div className="grid min-h-full place-items-center bg-[#f6f9ff] px-4 py-16">
        <Loader2 className="size-10 animate-spin text-[#2046ed]" />
      </div>
    )
  }

  return (
    <PaymentReturnView
      bookingId={bookingId}
      outcome={outcome}
      reason={reason}
    />
  )
}
