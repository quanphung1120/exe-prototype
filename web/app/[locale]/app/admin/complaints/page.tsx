import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminComplaints } from "@/lib/api"
import { AdminComplaintsView } from "@/features/admin/complaints"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminComplaints" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminComplaintsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const complaints = await fetchAdminComplaints()
  return <AdminComplaintsView complaints={complaints} />
}
