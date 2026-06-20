import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { OverviewView } from "@/components/dashboard/views/overview"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Overview" })
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
  return <OverviewView />
}
