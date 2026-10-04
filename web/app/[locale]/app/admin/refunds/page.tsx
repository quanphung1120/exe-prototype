import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminRefunds } from "@/lib/api"
import { AdminRefundsView } from "@/features/admin/refunds"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminRefunds" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminRefundsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const refunds = await fetchAdminRefunds()
  return <AdminRefundsView refunds={refunds} />
}
