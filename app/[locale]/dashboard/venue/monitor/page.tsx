import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { VenueMonitorView } from "@/components/dashboard/views/venue/monitor"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueMonitor" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueMonitorPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <VenueMonitorView />
}
