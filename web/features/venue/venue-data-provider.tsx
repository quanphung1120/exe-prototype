"use client"

import * as React from "react"

import {
  SCHEDULE_HOURS,
  courtById as courtByIdFn,
  courtDayEvents as courtDayEventsFn,
  type ChannelMixPoint,
  type CourtBlock,
  type PeakHourPoint,
  type RefundQueueItem,
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
} from "@/lib/shared"

import { useData } from "@/features/dashboard/data-provider"

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
  /** Bookings still owing a manual refund (SePay has no refund API) — read-only. */
  refundQueue: RefundQueueItem[]
  venueCustomers: VenueCustomer[]
  blocks: CourtBlock[]
  revenueSeries: RevenuePoint[]
  sportMix: SportMixPoint[]
  channelMix: ChannelMixPoint[]
  peakHours: PeakHourPoint[]
  venueInsights: VenueInsight[]
  addReservation: (reservation: Reservation) => void
  updateReservation: (id: string, patch: Partial<Reservation>) => void
  addCustomer: (customer: VenueCustomer) => void
  /** Overlay a freshly created court block onto the schedule. */
  addBlock: (block: CourtBlock) => void
  /** Drop a reopened block from the overlay ("Mở lại khung giờ"). */
  removeBlock: (blockId: string) => void
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

const TIME_RANGE_RE = /(\d{2}:\d{2})/g
const ACTIVE_SCHEDULE_STATUSES = new Set<string>([
  "pending",
  "confirmed",
  "checked-in",
  "completed",
] as const)

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function reservationDayKey(reservation: Reservation): string {
  return reservation.dayKey ?? ""
}

function reservationStart(reservation: Reservation): string | null {
  if (reservation.start) return reservation.start
  const [start] = reservation.time.match(TIME_RANGE_RE) ?? []
  return start ?? null
}

function reservationDuration(reservation: Reservation): number {
  if (reservation.durationMin) return reservation.durationMin
  const [start, end] = reservation.time.match(TIME_RANGE_RE) ?? []
  if (!start || !end) return 60
  return Math.max(15, toMinutes(end) - toMinutes(start))
}

function overlaps(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const a = toMinutes(startA)
  const b = toMinutes(startB)
  return a < b + durationB && b < a + durationA
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
  const [reservations, setReservations] = React.useState<Reservation[]>(
    seed.reservations
  )
  const [customers, setCustomers] = React.useState<VenueCustomer[]>(
    seed.customers
  )
  const [blocks, setBlocks] = React.useState<CourtBlock[]>(seed.blocks ?? [])

  const addBlock = React.useCallback((block: CourtBlock) => {
    setBlocks((current) =>
      current.some((b) => b.id === block.id) ? current : [...current, block]
    )
  }, [])

  const removeBlock = React.useCallback((blockId: string) => {
    setBlocks((current) => current.filter((b) => b.id !== blockId))
  }, [])

  const addCustomer = React.useCallback((customer: VenueCustomer) => {
    setCustomers((current) => {
      if (current.some((c) => c.id === customer.id)) {
        return current
      }
      return [...current, customer]
    })
  }, [])

  // Optimistically patch a reservation already in state (status change from
  // approve/decline/check-in/cancel, or a reschedule's new time). The server
  // action is the source of truth; this folds its returned record in so the
  // operator sees the change immediately without a full refetch.
  const updateReservation = React.useCallback(
    (id: string, patch: Partial<Reservation>) => {
      setReservations((current) =>
        current.map((r) => (r.id === id ? { ...r, ...patch } : r))
      )
    },
    []
  )

  const addReservation = React.useCallback((reservation: Reservation) => {
    setReservations((current) => [...current, reservation])

    if (reservation.source === "walk-in" && reservation.customer?.phone) {
      const phone = reservation.customer.phone.trim()
      setCustomers((currentCustomers) => {
        const exists = currentCustomers.find((c) => c.id === phone)
        if (!exists) {
          const newCust: VenueCustomer = {
            id: phone,
            name: reservation.customer.name,
            initials: reservation.customer.initials || "??",
            favoriteSport: reservation.sport,
            visits: 1,
            lastVisit: { en: "Today", vi: "Hôm nay" },
            ltv: reservation.price,
            noShowRate: 0,
            tier: "new",
            trend: 0,
          }
          return [...currentCustomers, newCust]
        } else {
          return currentCustomers.map((c) => {
            if (c.id === phone) {
              return {
                ...c,
                visits: c.visits + 1,
                lastVisit: { en: "Today", vi: "Hôm nay" },
                ltv: c.ltv + reservation.price,
              }
            }
            return c
          })
        }
      })
    }
  }, [])

  const { todayIso } = useData()

  const value = React.useMemo<VenueDataContextValue>(() => {
    const venue = seed.info
    const courts = seed.courts
    // A venue with a real operator gets an honest schedule — no fabricated
    // filler bookings, only real reservations (overlaid below) and genuine
    // court state (e.g. a maintenance block, which the helper still returns).
    const isOwned = Boolean(venue.ownerId)

    /** Real `CourtBlock` records for a court/day, projected to `ScheduleEvent`s. */
    const blockDayEvents = (courtId: string, dayKey: string): ScheduleEvent[] =>
      blocks
        .filter(
          (block) => block.courtId === courtId && block.dateKey === dayKey
        )
        .map((block): ScheduleEvent => ({
          id: block.id,
          courtId,
          start: block.start,
          durationMin: block.durationMin,
          kind: "blocked",
          sport: courtByIdFn(courts, courtId)?.sport ?? "badminton",
          blockReason: block.reason,
          blockNote: block.note,
          past:
            dayKey === todayIso &&
            toMinutes(block.start) + block.durationMin <= toMinutes(venue.now),
        }))

    const courtDayEvents = (courtId: string, dayKey: string) => {
      const base = courtDayEventsFn(
        venue,
        courts,
        courtId,
        dayKey,
        todayIso,
        !isOwned
      )
      const reservationOverlays = reservations
        .filter((reservation) => {
          if (!ACTIVE_SCHEDULE_STATUSES.has(reservation.status)) return false
          if (reservationDayKey(reservation) !== dayKey) return false
          const mappedCourtId =
            reservation.courtId ??
            courts.find((court) => court.name === reservation.court)?.id
          return mappedCourtId === courtId
        })
        .map((reservation) => {
          const start = reservationStart(reservation)
          if (!start) return null
          const durationMin = reservationDuration(reservation)
          const event: ScheduleEvent = {
            id: reservation.id,
            courtId,
            start,
            durationMin,
            kind: reservation.source === "walk-in" ? "walk-in" : "booked",
            customer: reservation.customer.name,
            customerPhone: reservation.customer.phone,
            sport: reservation.sport,
            party: reservation.party,
            past:
              dayKey === todayIso &&
              toMinutes(start) + durationMin <= toMinutes(venue.now),
          }
          return event
        })
        .filter((event): event is ScheduleEvent => event !== null)

      const blockOverlays = blockDayEvents(courtId, dayKey)
      const overlays = [...reservationOverlays, ...blockOverlays]
      if (!overlays.length) return base

      // A block always wins its slot over both the seed-filler base events and
      // a reservation (the API already rejects a block over a live booking and
      // vice versa, but the overlay stays defensive for stale/pre-blocks data).
      const filteredBase = base.filter((event) =>
        overlays.every(
          (overlay) =>
            !overlaps(
              event.start,
              event.durationMin,
              overlay.start,
              overlay.durationMin
            )
        )
      )
      const filteredReservations = blockOverlays.length
        ? reservationOverlays.filter((reservation) =>
            blockOverlays.every(
              (block) =>
                !overlaps(
                  reservation.start,
                  reservation.durationMin,
                  block.start,
                  block.durationMin
                )
            )
          )
        : reservationOverlays

      return [...filteredBase, ...filteredReservations, ...blockOverlays].sort(
        (a, b) => toMinutes(a.start) - toMinutes(b.start)
      )
    }
    const courtDaySlots = (courtId: string, dayKey: string) => {
      const court = courtByIdFn(courts, courtId)
      const sport = court?.sport ?? "badminton"
      const events = courtDayEvents(courtId, dayKey)
      const nowIdx = SCHEDULE_HOURS.indexOf(venue.now)
      return SCHEDULE_HOURS.map((hour, index): ScheduleSlot => {
        const event = events.find((item) =>
          overlaps(hour, 60, item.start, item.durationMin)
        )
        const past = dayKey === todayIso && index < nowIdx
        if (!event) {
          return { courtId, hour, kind: "free", sport, past }
        }
        return {
          courtId,
          hour,
          kind: event.kind,
          customer: event.customer,
          sport,
          party: event.party,
          past,
        } satisfies ScheduleSlot
      })
    }
    const venueEventsFor = (dayKey: string) =>
      courts.map((court) => courtDayEvents(court.id, dayKey))
    const venueScheduleFor = (dayKey: string) =>
      courts.map((court) => courtDaySlots(court.id, dayKey))

    return {
      venueId,
      venue,
      venueStats: seed.stats,
      venueCourts: courts,
      reservations,
      refundQueue: seed.refundQueue,
      venueCustomers: customers,
      blocks,
      revenueSeries: seed.revenueSeries,
      sportMix: seed.sportMix,
      channelMix: seed.channelMix,
      peakHours: seed.peakHours,
      venueInsights: seed.insights,
      addReservation,
      updateReservation,
      addCustomer,
      addBlock,
      removeBlock,
      courtById: (id) => courtByIdFn(courts, id),
      courtDayEvents,
      courtDaySlots,
      venueEventsFor,
      venueScheduleFor,
    }
  }, [
    addReservation,
    updateReservation,
    addCustomer,
    addBlock,
    removeBlock,
    reservations,
    customers,
    blocks,
    seed,
    venueId,
    todayIso,
  ])

  return (
    <VenueDataContext.Provider value={value}>
      {children}
    </VenueDataContext.Provider>
  )
}
