import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchMyVenue } from "@/lib/api"
import { SetupWizard } from "@/features/venue/setup-wizard"
import { redirect } from "@/i18n/navigation"

// Provisioned per Clerk user, so render dynamically.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueSetup" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ branch?: string }>
}) {
  const { locale } = await params
  const { branch } = await searchParams
  setRequestLocale(locale)

  // Adding another branch (chi nhánh, `?branch=1` from the switcher)? Run the
  // wizard even though the account is already provisioned. Otherwise the wizard
  // is one-shot for first-time setup — an already-provisioned account is sent
  // into its workspace.
  if (!branch) {
    const venue = await fetchMyVenue()
    if (venue) redirect({ href: "/dashboard/venue", locale })
  }

  return <SetupWizard />
}
