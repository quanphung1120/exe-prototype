import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import {
  VenueInsightsWorkspace,
  type InsightsTab,
} from "@/features/venue/insights-workspace"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueInsights" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { locale } = await params
  const { tab } = await searchParams
  setRequestLocale(locale)
  const initialTab: InsightsTab = tab === "players" ? "players" : "performance"
  return <VenueInsightsWorkspace initialTab={initialTab} />
}
