import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { WalletView } from "@/features/wallet/wallet-view"
import { apiFetch } from "@/lib/api"
import type { WalletSummary, WithdrawalRow } from "@/lib/shared"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Wallet" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

// Per-player and changes on every top-up/booking, so never cached.
export const dynamic = "force-dynamic"

export default async function WalletPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [wallet, withdrawals] = await Promise.all([
    apiFetch<WalletSummary>("/api/wallet"),
    apiFetch<WithdrawalRow[]>("/api/wallet/withdrawals"),
  ])
  return <WalletView wallet={wallet} withdrawals={withdrawals} />
}
