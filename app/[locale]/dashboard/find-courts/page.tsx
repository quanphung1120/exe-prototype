import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { FindCourtsView } from "@/components/dashboard/views/find-courts"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "FindCourts" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function FindCourtsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <FindCourtsView />
}
