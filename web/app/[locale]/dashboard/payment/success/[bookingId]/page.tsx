import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { PaymentSuccessView } from "@/features/booking/payment-success"

// Landed on straight after a real SePay checkout — `successUrl` in
// `PaymentsService#checkout` (api) points here, `${SEPAY_RETURN_URL}/<bookingId>`.
// SePay always returns in the default locale; `PaymentSuccessView` restores the
// player's original locale (stashed in localStorage) before showing the result.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "PaymentReturn" })
  return { title: t("metaTitle") }
}

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>
}) {
  const { locale, bookingId } = await params
  setRequestLocale(locale)
  return <PaymentSuccessView bookingId={bookingId} />
}
