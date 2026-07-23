import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminVenuesAndBrands } from "@/lib/api"
import { AdminVenuesView } from "@/features/admin/venues"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminVenues" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminVenuesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const groups = await fetchAdminVenuesAndBrands()
  return <AdminVenuesView groups={groups} />
}
