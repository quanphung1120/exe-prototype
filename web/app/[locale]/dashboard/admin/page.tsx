import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminOverview } from "@/lib/api"
import { AdminOverviewView } from "@/features/admin/overview"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminOverview" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const overview = await fetchAdminOverview()
  return <AdminOverviewView overview={overview} />
}
