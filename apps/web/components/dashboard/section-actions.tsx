"use client"

import type { ComponentType } from "react"
import { CalendarPlus, Play, Plus, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Link, usePathname } from "@/i18n/navigation"
import { useBooking } from "@/components/dashboard/booking"
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
 * The dashboard used to re-render its primary CTAs *inside* each view (a Play
 * button on Overview, "New Booking" on Bookings/Command Center, the Quick
 * Join + Create Room toolbar on Match Maker) on top of a generic topbar
 * button. This module is the single home for those actions: each workspace has
 * a default action and a small registry of per-section overrides, so a section
 * declares its topbar actions in one place and the views stay duplication-free.
 */

/** Player default — open the Play chooser. */
function PlayAction() {
  const tPlay = useTranslations("Play")
  const { openPlay } = useBooking()
  return (
    <Button size="sm" className="rounded-full" onClick={openPlay}>
      <Play />
      <span className="hidden sm:inline">{tPlay("button")}</span>
    </Button>
  )
}

/** Clear all messages on the AI Assistant chat. */
function ClearChatAction() {
  const t = useTranslations("AiDashboard")
  const handleClear = () => {
    window.dispatchEvent(new CustomEvent("clear-ai-chat"))
  }
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={handleClear}>
      <RotateCcw className="size-4 mr-1.5" />
      <span>{t("clearChat")}</span>
    </Button>
  )
}

/** Bookings override — same Play chooser, booking-flavored label. */
function NewBookingAction() {
  const t = useTranslations("Bookings")
  const { openPlay } = useBooking()
  return (
    <Button size="sm" className="rounded-full" onClick={openPlay}>
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
  dashboard: ClearChatAction,
  // Play hosts its own segmented toolbar (Matches/Courts + Quick Join), so the
  // topbar carries no extra CTA there.
  play: () => null,
  bookings: NewBookingAction,
  // The booking wizard is itself the action — no topbar CTA needed.
  book: () => null,
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
  const Action = PLAYER_ACTIONS[sectionKey as SectionKey] ?? PlayAction
  return <Action />
}
