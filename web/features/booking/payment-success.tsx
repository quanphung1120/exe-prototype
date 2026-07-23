"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useLocale } from "next-intl"

import { useRouter } from "@/i18n/navigation"
import { readPreferredLocale } from "@/lib/locale-preference"
import { PaymentReturnView } from "@/features/booking/payment-return"

/**
 * Landed on straight after a real SePay checkout (`successUrl` in the API's
 * `PaymentsService#checkout` → `${SEPAY_RETURN_URL}/<bookingId>`). That return
 * URL is static, so SePay always brings the player back in the default locale
 * (`vi`). Before rendering the payment result, we read the locale the player
 * was actually on — stashed in `localStorage` right before the redirect (see
 * `savePreferredLocale` in `session.tsx#pay`) — and, if it differs from the
 * locale in the URL, replace to the matching prefix so the whole return
 * experience stays in their language. Only then does {@link PaymentReturnView}
 * take over the payment-status polling.
 */
export function PaymentSuccessView({ bookingId }: { bookingId: string }) {
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
        router.replace(`/dashboard/payment/success/${bookingId}`, {
          locale: preferred,
        })
      } else {
        setRedirecting(false)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [bookingId, locale, router])

  // While deciding (or mid-redirect), show a spinner rather than flashing the
  // wrong-locale payment screen for a frame.
  if (redirecting !== false) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center">
        <Loader2 className="size-10 animate-spin text-brand" />
      </div>
    )
  }

  return <PaymentReturnView bookingId={bookingId} />
}
