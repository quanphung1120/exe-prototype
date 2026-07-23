import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminApprovals } from "@/lib/api"
import { AdminApprovalsView } from "@/features/admin/approvals"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminApprovals" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminApprovalsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const venues = await fetchAdminApprovals()
  return <AdminApprovalsView venues={venues} />
}
