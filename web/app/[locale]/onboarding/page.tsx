import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAccountType } from "@/lib/api"
import { OnboardingView } from "@/features/onboarding/onboarding-view"
import { redirect } from "@/i18n/navigation"

// The account's effective type is resolved per Clerk user, so render dynamically.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Onboarding" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // Already chosen (or inferred)? The choice is one-shot — send them straight
  // into their workspace instead of re-asking.
  const accountType = await fetchAccountType()
  if (accountType) {
    redirect({
      href: accountType === "venue" ? "/dashboard/venue" : "/dashboard",
      locale,
    })
  }

  return <OnboardingView />
}
