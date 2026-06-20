"use client"

import * as React from "react"

import {
  buildRoster,
  conflictFor as conflictForFn,
  courtByVenue as courtByVenueFn,
  courtById as courtByIdFn,
  courtDayEvents as courtDayEventsFn,
  courtDaySlots as courtDaySlotsFn,
  courtNumberFor as courtNumberForFn,
  courtSlots as courtSlotsFn,
  playerByInitials as playerByInitialsFn,
  sessionToBooking as sessionToBookingFn,
  venueEventsFor as venueEventsForFn,
  venueScheduleFor as venueScheduleForFn,
  type ActivityItem,
  type Booking,
  type ChannelMixPoint,
  type Chat,
  type Conflict,
  type ConflictQuery,
  type Court,
  type MatchRoom,
  type Message,
  type NotificationItem,
  type PeakHourPoint,
  type Player,
  type PlaySession,
  type Reservation,
  type RevenuePoint,
  type RosterEntry,
  type ScheduleEvent,
  type ScheduleSlot,
  type Seed,
  type SportMixPoint,
  type Stats,
  type Streak,
  type User,
  type Venue,
  type VenueCourt,
  type VenueCustomer,
  type VenueInsight,
  type VenueStats,
} from "@repo/shared"

/**
 * The hardcoded records (fetched from the Hono API) plus helpers pre-bound to
 * them — so call sites keep the original `playerByInitials(initials)` /
 * `courtSlots(courtId, day)` signatures even though the records now live in the
 * API rather than a web module.
 */
interface DataContextValue {
  // ── Player records ──
  user: User
  players: Player[]
  courts: Court[]
  rooms: MatchRoom[]
  bookings: Booking[]
  /** Seed sessions (built from rooms + bookings) the SessionProvider hydrates. */
  sessions: PlaySession[]
  chats: Chat[]
  thread: Message[]
  streak: Streak
  stats: Stats
  activity: ActivityItem[]
  notifications: NotificationItem[]
  // ── Venue records ──
  /** Every venue the operator manages (profiles), for the switcher/manager. */
  venues: Venue[]
  /** Which venue the dashboard is currently scoped to. */
  activeVenueId: string
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
  // ── Record-bound helpers ──
  playerByInitials: (initials: string) => RosterEntry
  courtByVenue: (name: string) => Court | undefined
  courtNumberFor: (courtId: string) => string
  courtSlots: (
    courtId: string,
    dayKey: string
  ) => { time: string; taken: boolean }[]
  conflictFor: (sessions: PlaySession[], q: ConflictQuery) => Conflict
  sessionToBooking: (s: PlaySession) => Booking
  courtById: (id: string) => VenueCourt | undefined
  courtDayEvents: (courtId: string, dayKey: string) => ScheduleEvent[]
  courtDaySlots: (courtId: string, dayKey: string) => ScheduleSlot[]
  venueEventsFor: (dayKey: string) => ScheduleEvent[][]
  venueScheduleFor: (dayKey: string) => ScheduleSlot[][]
}

const DataContext = React.createContext<DataContextValue | null>(null)

/** Access the hardcoded dataset (served by the API) and its bound helpers. */
export function useData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useData must be used within a DataProvider.")
  return ctx
}

/**
 * Holds the dataset fetched from the Hono API (passed down from the dashboard
 * server layout) and exposes it — plus helpers bound to it — through `useData`.
 * The seed is static, so this never refetches and there is no loading state.
 */
export function DataProvider({
  seed,
  children,
}: {
  seed: Seed
  children: React.ReactNode
}) {
  const value = React.useMemo<DataContextValue>(() => {
    const { venue, ...player } = seed
    const courts = player.courts
    const roster = buildRoster(player.user, player.players)
    return {
      // Player records
      user: player.user,
      players: player.players,
      courts,
      rooms: player.rooms,
      bookings: player.bookings,
      sessions: player.sessions,
      chats: player.chats,
      thread: player.thread,
      streak: player.streak,
      stats: player.stats,
      activity: player.activity,
      notifications: player.notifications,
      // Venue records
      venues: player.venues,
      activeVenueId: player.activeVenueId,
      venue: venue.info,
      venueStats: venue.stats,
      venueCourts: venue.courts,
      reservations: venue.reservations,
      venueCustomers: venue.customers,
      revenueSeries: venue.revenueSeries,
      sportMix: venue.sportMix,
      channelMix: venue.channelMix,
      peakHours: venue.peakHours,
      venueInsights: venue.insights,
      // Bound helpers (original signatures preserved)
      playerByInitials: (initials) => playerByInitialsFn(roster, initials),
      courtByVenue: (name) => courtByVenueFn(courts, name),
      courtNumberFor: (courtId) => courtNumberForFn(courts, courtId),
      courtSlots: (courtId, dayKey) => courtSlotsFn(courts, courtId, dayKey),
      conflictFor: (sessions, q) =>
        conflictForFn(courts, player.user, sessions, q),
      sessionToBooking: (s) => sessionToBookingFn(courts, s),
      courtById: (id) => courtByIdFn(venue.courts, id),
      courtDayEvents: (courtId, dayKey) =>
        courtDayEventsFn(venue.info, venue.courts, courtId, dayKey),
      courtDaySlots: (courtId, dayKey) =>
        courtDaySlotsFn(venue.info, venue.courts, courtId, dayKey),
      venueEventsFor: (dayKey) =>
        venueEventsForFn(venue.info, venue.courts, dayKey),
      venueScheduleFor: (dayKey) =>
        venueScheduleForFn(venue.info, venue.courts, dayKey),
    }
  }, [seed])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
