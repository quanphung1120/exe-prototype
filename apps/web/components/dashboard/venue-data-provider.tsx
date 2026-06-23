"use client"

import * as React from "react"

import {
  courtById as courtByIdFn,
  courtDayEvents as courtDayEventsFn,
  courtDaySlots as courtDaySlotsFn,
  venueEventsFor as venueEventsForFn,
  venueScheduleFor as venueScheduleForFn,
  type ChannelMixPoint,
  type PeakHourPoint,
  type Reservation,
  type RevenuePoint,
  type ScheduleEvent,
  type ScheduleSlot,
  type SportMixPoint,
  type Venue,
  type VenueCourt,
  type VenueCustomer,
  type VenueInsight,
  type VenueSeed,
  type VenueStats,
} from "@repo/shared"

/**
 * Venue-scoped records and helpers. Read from the per-venue layout and bound
 * to the venue's data so call sites keep clean signatures.
 */
interface VenueDataContextValue {
  venueId: string
  venue: Venue
  venueStats: VenueStats
  venueCourts: VenueCourt[]
  reservations: Reservation[]
  venueCustomers: VenueCustomer[]
  revenueSeries: RevenuePoint[]
  sportMix: SportMixPoint[]
  channelMix: ChannelMixPoint[]
  peakHours: PeakHourPoint[]
  venueInsights: VenueInsight[]
  // Bound helpers
  courtById: (id: string) => VenueCourt | undefined
  courtDayEvents: (courtId: string, dayKey: string) => ScheduleEvent[]
  courtDaySlots: (courtId: string, dayKey: string) => ScheduleSlot[]
  venueEventsFor: (dayKey: string) => ScheduleEvent[][]
  venueScheduleFor: (dayKey: string) => ScheduleSlot[][]
}

const VenueDataContext = React.createContext<VenueDataContextValue | null>(null)

/** Access the venue dataset and its bound helpers. Throws if used outside venue workspace. */
export function useVenueData(): VenueDataContextValue {
  const ctx = React.useContext(VenueDataContext)
  if (!ctx)
    throw new Error("useVenueData must be used within a VenueDataProvider.")
  return ctx
}

/**
 * Optional version that returns null instead of throwing when outside venue workspace.
 * Useful for components that conditionally render in both player and venue workspaces.
 */
export function useOptionalVenueData(): VenueDataContextValue | null {
  return React.useContext(VenueDataContext)
}

/**
 * Provides venue-scoped data fetched from the per-venue layout.
 * Mounted in `/dashboard/venue/[venueId]/layout.tsx` so all venue-workspace
 * pages have access to venue data via `useVenueData()`.
 */
export function VenueDataProvider({
  seed,
  venueId,
  children,
}: {
  seed: VenueSeed
  venueId: string
  children: React.ReactNode
}) {
  const value = React.useMemo<VenueDataContextValue>(() => {
    const venue = seed.info
    const courts = seed.courts

    return {
      venueId,
      venue,
      venueStats: seed.stats,
      venueCourts: courts,
      reservations: seed.reservations,
      venueCustomers: seed.customers,
      revenueSeries: seed.revenueSeries,
      sportMix: seed.sportMix,
      channelMix: seed.channelMix,
      peakHours: seed.peakHours,
      venueInsights: seed.insights,
      // Bound helpers
      courtById: (id) => courtByIdFn(courts, id),
      courtDayEvents: (courtId, dayKey) =>
        courtDayEventsFn(venue, courts, courtId, dayKey),
      courtDaySlots: (courtId, dayKey) =>
        courtDaySlotsFn(venue, courts, courtId, dayKey),
      venueEventsFor: (dayKey) => venueEventsForFn(venue, courts, dayKey),
      venueScheduleFor: (dayKey) => venueScheduleForFn(venue, courts, dayKey),
    }
  }, [seed, venueId])

  return (
    <VenueDataContext.Provider value={value}>
      {children}
    </VenueDataContext.Provider>
  )
}
