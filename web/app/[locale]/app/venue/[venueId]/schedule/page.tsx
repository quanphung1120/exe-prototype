import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import {
  VenueScheduleWorkspace,
  type ScheduleTab,
} from "@/features/venue/schedule-workspace"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueSchedule" })
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
}

export default async function VenueSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ tab?: string; day?: string }>
}) {
  const { locale } = await params
  const { tab, day } = await searchParams
  setRequestLocale(locale)
  const initialTab: ScheduleTab =
    tab === "reservations" ? "reservations" : "calendar"
  return <VenueScheduleWorkspace initialTab={initialTab} initialDay={day} />
}
