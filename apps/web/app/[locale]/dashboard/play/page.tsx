import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { PlayView, type PlayTab } from "@/components/dashboard/views/play"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Play" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { locale } = await params
  const { tab } = await searchParams
  setRequestLocale(locale)
  const initialTab: PlayTab = tab === "courts" ? "courts" : "rooms"
  return <PlayView initialTab={initialTab} />
}
