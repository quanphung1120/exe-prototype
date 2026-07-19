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
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // Already provisioned? The wizard is one-shot — send them into the workspace.
  const venue = await fetchMyVenue()
  if (venue) redirect({ href: "/dashboard/venue", locale })

  return <SetupWizard />
}
