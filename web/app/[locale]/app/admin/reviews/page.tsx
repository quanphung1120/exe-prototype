import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAdminAppReviews } from "@/lib/api"
import { AdminAppReviewsView } from "@/features/admin/app-reviews"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AdminAppReviews" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AdminAppReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const reviews = await fetchAdminAppReviews()
  return <AdminAppReviewsView reviews={reviews} />
}
