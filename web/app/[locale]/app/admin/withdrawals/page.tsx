import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminWithdrawals } from "@/lib/api"
import { AdminWithdrawalsView } from "@/features/admin/withdrawals"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminWithdrawals" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminWithdrawalsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const withdrawals = await fetchAdminWithdrawals()
  return <AdminWithdrawalsView withdrawals={withdrawals} />
}
