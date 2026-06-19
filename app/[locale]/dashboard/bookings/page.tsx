import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { BookingsView } from "@/components/dashboard/views/bookings"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Bookings" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <BookingsView />
}
