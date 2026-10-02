import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminBookings } from "@/lib/api"
import { AdminBookingsView } from "@/features/admin/bookings"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminBookings" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const bookings = await fetchAdminBookings()
  return <AdminBookingsView bookings={bookings} />
}
