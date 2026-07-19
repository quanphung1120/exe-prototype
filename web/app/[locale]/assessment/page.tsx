import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { fetchAssessment } from "@/lib/api"
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
  const initial = await fetchAssessment()
  return <SkillsAssessmentView initial={initial} />
}
