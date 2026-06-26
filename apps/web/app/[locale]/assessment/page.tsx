import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { SkillsAssessmentView } from "@/components/dashboard/views/skills-assessment"

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
  return <SkillsAssessmentView />
}
