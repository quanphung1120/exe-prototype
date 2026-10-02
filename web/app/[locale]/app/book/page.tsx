import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { BookView } from "@/features/booking/book"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Booking" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <BookView />
}
