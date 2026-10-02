import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminDiscounts } from "@/lib/api"
import { AdminDiscountsView } from "@/features/admin/discounts"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminDiscounts" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminDiscountsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const discounts = await fetchAdminDiscounts()
  return <AdminDiscountsView discounts={discounts} />
}
