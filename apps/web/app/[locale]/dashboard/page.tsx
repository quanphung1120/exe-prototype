import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { CourtFinderView } from "@/components/dashboard/views/court-finder"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "CourtFinder" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <CourtFinderView />
}
