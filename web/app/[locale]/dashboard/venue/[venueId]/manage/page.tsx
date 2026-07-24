import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchBranchesSummary } from "@/lib/api"
import { VenueManageView } from "@/features/venue/manage"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueManage" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueManagePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const branches = await fetchBranchesSummary()
  return <VenueManageView branches={branches} />
}
