import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAccountType, fetchAssessment, fetchMyVenue } from "@/lib/api"
import { SkillsAssessmentView } from "@/features/assessment/skills-assessment"

// The assessment is fetched per request from the Hono API (per Clerk user), so
// render dynamically rather than statically.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Assessment" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [initial, accountType, venue] = await Promise.all([
    fetchAssessment(),
    fetchAccountType(),
    fetchMyVenue(),
  ])
  // "Both" accounts still need the venue wizard when they haven't provisioned
  // one yet — the assessment always comes first in that ordering.
  const nextPath = accountType !== "player" && !venue ? "/setup" : "/dashboard"
  return <SkillsAssessmentView initial={initial} nextPath={nextPath} />
}
