"use client"

import * as React from "react"

import {
  buildRoster,
  conflictFor as conflictForFn,
  courtByVenue as courtByVenueFn,
  courtDayBusy as courtDayBusyFn,
  courtDayGaps as courtDayGapsFn,
  courtNumberFor as courtNumberForFn,
  courtSlots as courtSlotsFn,
  playerByInitials as playerByInitialsFn,
  sessionToBooking as sessionToBookingFn,
  type ActivityItem,
  type Booking,
  type Chat,
  type Conflict,
  type ConflictQuery,
  type Court,
  type CourtBand,
  type MatchRoom,
  type Message,
  type NotificationItem,
  type Player,
  type PlaySession,
  type RosterEntry,
  type Seed,
  type Stats,
  type Streak,
  type User,
  type Venue,
} from "@repo/shared"

/**
 * The player-scoped records (fetched from the Hono API) plus helpers pre-bound to
 * them — so call sites keep the original `playerByInitials(initials)` /
 * `courtSlots(courtId, day)` signatures even though the records now live in the
 * API rather than a web module.
 *
 * Venue-operator records are **not** here — they are per-venue and provided by
 * {@link VenueDataProvider} under each `/dashboard/venue/[venueId]` subtree. The
 * one exception is {@link DataContextValue.venues}, the operator's *list* of
 * venue profiles (account-level, used by the sidebar switcher/manager).
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
  /** Every venue the operator manages (profiles), for the switcher/manager. */
  venues: Venue[]
  // ── Record-bound helpers ──
  playerByInitials: (initials: string) => RosterEntry
  courtByVenue: (name: string) => Court | undefined
  courtNumberFor: (courtId: string) => string
  courtSlots: (
    courtId: string,
    dayKey: string
  ) => { time: string; taken: boolean }[]
  conflictFor: (sessions: PlaySession[], q: ConflictQuery) => Conflict
  courtDayBusy: (
    sessions: PlaySession[],
    courtId: string,
    dayKey: string,
    ignoreId?: string
  ) => CourtBand[]
  courtDayGaps: (
    sessions: PlaySession[],
    courtId: string,
    dayKey: string,
    ignoreId?: string
  ) => CourtBand[]
  sessionToBooking: (s: PlaySession) => Booking
}

const DataContext = React.createContext<DataContextValue | null>(null)

/** Access the player dataset (served by the API) and its bound helpers. */
export function useData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useData must be used within a DataProvider.")
  return ctx
}

/**
 * Holds the player dataset fetched from the Hono API (passed down from the
 * dashboard server layout) and exposes it — plus helpers bound to it — through
 * `useData`. The seed is static, so this never refetches and there is no loading
 * state.
 */
export function DataProvider({
  seed,
  children,
}: {
  seed: Seed
  children: React.ReactNode
}) {
  const value = React.useMemo<DataContextValue>(() => {
    const courts = seed.courts
    const roster = buildRoster(seed.user, seed.players)
    return {
      // Player records
      user: seed.user,
      players: seed.players,
      courts,
      rooms: seed.rooms,
      bookings: seed.bookings,
      sessions: seed.sessions,
      chats: seed.chats,
      thread: seed.thread,
      streak: seed.streak,
      stats: seed.stats,
      activity: seed.activity,
      notifications: seed.notifications,
      // Operator's venue profiles (account-level list)
      venues: seed.venues,
      // Bound helpers (original signatures preserved)
      playerByInitials: (initials) => playerByInitialsFn(roster, initials),
      courtByVenue: (name) => courtByVenueFn(courts, name),
      courtNumberFor: (courtId) => courtNumberForFn(courts, courtId),
      courtSlots: (courtId, dayKey) => courtSlotsFn(courts, courtId, dayKey),
      conflictFor: (sessions, q) =>
        conflictForFn(courts, seed.user, sessions, q),
      courtDayBusy: (sessions, courtId, dayKey, ignoreId) =>
        courtDayBusyFn(courts, sessions, courtId, dayKey, ignoreId),
      courtDayGaps: (sessions, courtId, dayKey, ignoreId) =>
        courtDayGapsFn(courts, sessions, courtId, dayKey, ignoreId),
      sessionToBooking: (s) => sessionToBookingFn(courts, s),
    }
  }, [seed])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
