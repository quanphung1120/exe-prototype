import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { ChatView } from "@/components/dashboard/views/chat"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Chat" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <ChatView />
}
