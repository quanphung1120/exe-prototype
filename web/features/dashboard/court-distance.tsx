"use client"

import { useTranslations } from "next-intl"
import { useData } from "./data-provider"

/** Always resolve distance for this viewer, never a room host's saved distance. */
export function CourtDistance({
  courtId,
  venue,
}: {
  courtId?: string | null
  venue?: string
}) {
  const { courts } = useData()
  const t = useTranslations("Shared")
  const court = courts.find((c) =>
    courtId ? c.id === courtId : c.name === venue
  )
  return court?.distanceKm != null
    ? t("distance", { km: court.distanceKm })
    : t("distanceUnknown")
}
