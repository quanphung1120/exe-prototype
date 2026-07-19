import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { ChatView } from "@/features/chat/chat"

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
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ channel?: string }>
}) {
  const { locale } = await params
  const { channel } = await searchParams
  setRequestLocale(locale)
  return <ChatView initialChannelId={channel} />
}
