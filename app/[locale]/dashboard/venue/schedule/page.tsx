import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { VenueScheduleView } from "@/components/dashboard/views/venue/schedule"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueSchedule" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <VenueScheduleView />
}
