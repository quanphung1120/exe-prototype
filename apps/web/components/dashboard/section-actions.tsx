"use client"

import type { ComponentType } from "react"
import { CalendarPlus, Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Link, usePathname } from "@/i18n/navigation"
import type { SectionKey } from "@/components/dashboard/nav"
import {
  venueBase,
  type VenueSectionKey,
} from "@/components/dashboard/venue/nav"
import {
  venueIdFromPath,
  type Workspace,
} from "@/components/dashboard/workspace"

/**
 * Per-section primary actions, surfaced in the topbar.
 *
 * The dashboard used to re-render its primary CTAs *inside* each view on top
 * of generic topbar buttons. This module is the single home for those actions:
 * each workspace has a default action and a small registry of per-section
 * overrides, so a section declares its topbar actions in one place and the
 * views stay duplication-free.
 */

/** Player default — no generic topbar CTA. */
function EmptyAction() {
  return null
}

/** Bookings override — explicit booking CTA. */
function NewBookingAction() {
  const t = useTranslations("Bookings")
  return (
    <Button
      size="sm"
      className="rounded-full"
      nativeButton={false}
      render={<Link href="/dashboard/book" />}
    >
      <CalendarPlus />
      <span className="hidden sm:inline">{t("newBooking")}</span>
    </Button>
  )
}

/** Venue default — jump to the schedule to add a booking. */
function VenueNewBookingAction() {
  const tNav = useTranslations("VenueNav")
  // The topbar lives in the shared layout (outside the venue data provider), so
  // the active venue is read from the URL rather than useVenueData().
  const pathname = usePathname()
  const venueId = venueIdFromPath(pathname)
  if (!venueId) return null
  return (
    <Button
      size="sm"
      className="rounded-full"
      nativeButton={false}
      render={<Link href={`${venueBase(venueId)}/schedule`} />}
    >
      <Plus />
      <span className="hidden sm:inline">{tNav("newBooking")}</span>
    </Button>
  )
}

/** Sections whose topbar action differs from the workspace default. */
const PLAYER_ACTIONS: Partial<Record<SectionKey, ComponentType>> = {
  dashboard: EmptyAction,
  chat: EmptyAction,
  bookings: NewBookingAction,
  play: EmptyAction,
  book: EmptyAction,
}

const VENUE_ACTIONS: Partial<Record<VenueSectionKey, ComponentType>> = {}

/** Render the active section's topbar actions for the given workspace. */
export function SectionActions({
  workspace,
  sectionKey,
}: {
  workspace: Workspace
  sectionKey: string
}) {
  if (workspace === "venue") {
    const Action =
      VENUE_ACTIONS[sectionKey as VenueSectionKey] ?? VenueNewBookingAction
    return <Action />
  }
  const Action = PLAYER_ACTIONS[sectionKey as SectionKey] ?? EmptyAction
  return <Action />
}
