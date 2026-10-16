import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { PaymentScreen } from "@/features/booking/payment-screen"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "PaymentVietQr" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

// Pay a booking by bank transfer (VietQR): the venue's QR and memo, then the
// player's screenshot. `?discount=<code>` carries a code applied in the wizard.
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; bookingId: string }>
  searchParams: Promise<{ discount?: string }>
}) {
  const { locale, bookingId } = await params
  const { discount } = await searchParams
  setRequestLocale(locale)
  return (
    <PaymentScreen
      bookingId={bookingId}
      discountCode={discount?.trim() || undefined}
    />
  )
}
