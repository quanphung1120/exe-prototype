import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { VenueAnalyticsView } from "@/components/dashboard/views/venue/analytics"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueAnalytics" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <VenueAnalyticsView />
}
