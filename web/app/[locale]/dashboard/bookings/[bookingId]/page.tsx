import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { PaymentReturnView } from "@/features/booking/payment-return"

// Landed on straight after a real SePay checkout — `successUrl` in
// `PaymentsService#checkout` (api) points here, `${SEPAY_RETURN_URL}/<bookingId>`.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "PaymentReturn" })
  return { title: t("metaTitle") }
}

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>
}) {
  const { locale, bookingId } = await params
  setRequestLocale(locale)
  return <PaymentReturnView bookingId={bookingId} />
}
