import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { PaymentReturnPage } from "@/features/booking/payment-success"

// Landed on when a SePay checkout doesn't go through — `error_url` /
// `cancel_url` in `PaymentsService#checkout` (api, see `return-urls.ts`) point
// here, `${SEPAY_RETURN_URL}/failed/<bookingId>?reason=error|cancelled`. The
// page double-checks the payment once (the IPN may still have settled it) and
// otherwise offers to retry while the court hold lasts.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "PaymentReturn" })
  return { title: t("metaTitleFailed") }
}

export default async function PaymentFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; bookingId: string }>
  searchParams: Promise<{ reason?: string }>
}) {
  const { locale, bookingId } = await params
  const { reason } = await searchParams
  setRequestLocale(locale)
  return (
    <PaymentReturnPage
      bookingId={bookingId}
      outcome="failed"
      reason={reason === "cancelled" ? "cancelled" : "error"}
    />
  )
}
