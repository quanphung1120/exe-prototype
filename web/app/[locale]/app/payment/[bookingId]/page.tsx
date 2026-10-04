import { redirect } from "@/i18n/navigation"

// Legacy SePay return URL — `${SEPAY_RETURN_URL}/<bookingId>` with no outcome
// segment, which a checkout started before the success/failed split (or by an
// api still on the old build) bakes into its SePay order. Forward it to the
// success page: that page verifies the real payment status itself, so an
// unpaid/cancelled order still lands on the right result.
export default async function LegacyPaymentReturnPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>
}) {
  const { locale, bookingId } = await params
  redirect({
    href: `/app/payment/success/${encodeURIComponent(bookingId)}`,
    locale,
  })
}
