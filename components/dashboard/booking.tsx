"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  BOOKINGS,
  BOOKING_DAYS,
  COURTS,
  USER,
  dayKeyForRoom,
  playerByInitials,
  slotRange,
  type Booking,
  type BookingPlayer,
  type Court,
  type MatchRoom,
  type SportKey,
} from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"

export type FillMode = "court" | "invite" | "find"

interface BookingDraft {
  dayKey: string
  slot: string | null
  format: "Singles" | "Doubles"
  fillMode: FillMode
  invitees: string[]
}

interface BookingContextValue {
  bookings: Booking[]
  playOpen: boolean
  openPlay: () => void
  closePlay: () => void
  open: boolean
  courtId: string | null
  roomId: string | null
  court: Court | null
  steps: string[]
  step: number
  draft: BookingDraft
  capacityFor: (format: "Singles" | "Doubles") => number
  openBooking: (
    courtId: string | null,
    opts?: { roomId?: string; fillMode?: FillMode }
  ) => void
  closeBooking: () => void
  next: () => void
  back: () => void
  setCourt: (courtId: string) => void
  setDay: (dayKey: string) => void
  setSlot: (slot: string) => void
  setFormat: (format: "Singles" | "Doubles") => void
  setFillMode: (mode: FillMode) => void
  toggleInvite: (initials: string) => void
  confirmBooking: () => void
  cancelBooking: (id: string) => void
}

const BookingContext = React.createContext<BookingContextValue | null>(null)

export function useBooking() {
  const ctx = React.useContext(BookingContext)
  if (!ctx) {
    throw new Error("useBooking must be used within a BookingProvider.")
  }
  return ctx
}

const capacityFor = (format: "Singles" | "Doubles") =>
  format === "Singles" ? 2 : 4

/** Build the step list for a launch: prepend "court" only when none is chosen. */
function stepsFor(courtId: string | null): string[] {
  return courtId
    ? ["slot", "players", "confirm"]
    : ["court", "slot", "players", "confirm"]
}

const EMPTY_DRAFT: BookingDraft = {
  dayKey: "today",
  slot: null,
  format: "Doubles",
  fillMode: "court",
  invitees: [],
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")
  const { rooms, userLevel, addRoom, attachBooking, detachBooking, fillRoom } =
    useMatchmaking()

  const [bookings, setBookings] = React.useState<Booking[]>(BOOKINGS)
  const [playOpen, setPlayOpen] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [courtId, setCourtId] = React.useState<string | null>(null)
  const [roomId, setRoomId] = React.useState<string | null>(null)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<BookingDraft>(EMPTY_DRAFT)
  const idRef = React.useRef(0)

  const court = courtId ? COURTS.find((c) => c.id === courtId) ?? null : null
  const steps = stepsFor(courtId)

  const openPlay = () => setPlayOpen(true)
  const closePlay = () => setPlayOpen(false)

  const openBooking = (
    cid: string | null,
    opts?: { roomId?: string; fillMode?: FillMode }
  ) => {
    const rid = opts?.roomId ?? null
    const room = rid ? rooms.find((r) => r.id === rid) ?? null : null
    setPlayOpen(false)
    setCourtId(cid)
    setRoomId(rid)
    setStep(0)
    setDraft({
      dayKey: room ? dayKeyForRoom(room) : "today",
      slot: null,
      format: room?.format ?? "Doubles",
      // A room already exists, so no fill-mode choice; otherwise intent default.
      fillMode: room ? "court" : opts?.fillMode ?? "court",
      invitees: room ? room.players.filter((p) => p !== USER.initials) : [],
    })
    setOpen(true)
  }

  const closeBooking = () => setOpen(false)

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const setCourt = (cid: string) => setCourtId(cid)
  const setDay = (dayKey: string) =>
    setDraft((d) => ({ ...d, dayKey, slot: null }))
  const setSlot = (slot: string) => setDraft((d) => ({ ...d, slot }))
  const setFormat = (format: "Singles" | "Doubles") =>
    setDraft((d) => ({
      ...d,
      format,
      // Trim invitees that no longer fit the smaller format.
      invitees: d.invitees.slice(0, capacityFor(format) - 1),
    }))
  const setFillMode = (fillMode: FillMode) =>
    setDraft((d) => ({ ...d, fillMode }))
  const toggleInvite = (initials: string) =>
    setDraft((d) => {
      if (d.invitees.includes(initials)) {
        return { ...d, invitees: d.invitees.filter((i) => i !== initials) }
      }
      if (d.invitees.length >= capacityFor(d.format) - 1) return d
      return { ...d, invitees: [...d.invitees, initials] }
    })

  /** Construct a MatchRoom for invite/find bookings. */
  const buildRoom = (
    id: string,
    bookingId: string,
    c: Court,
    sport: SportKey,
    players: string[]
  ): MatchRoom => {
    const day = BOOKING_DAYS.find((d) => d.key === draft.dayKey) ?? BOOKING_DAYS[0]
    return {
      id,
      host: { name: USER.name, initials: USER.initials },
      title: t("roomTitle", {
        sport: tc(`sports.${sport}`),
        court: c.name,
      }),
      sport,
      format: draft.format,
      venue: c.name,
      district: c.district,
      distanceKm: c.distanceKm,
      day: day.label,
      time: slotRange(draft.slot ?? "18:00"),
      level: userLevel,
      capacity: capacityFor(draft.format),
      joined: players.length,
      players,
      pricePerHour: c.pricePerHour,
      bookingId,
    }
  }

  const confirmBooking = () => {
    if (!court || !draft.slot) return
    const room = roomId ? rooms.find((r) => r.id === roomId) : null
    const sport = room?.sport ?? court.sports[0]
    const id = `b-new-${idRef.current++}`
    const day = BOOKING_DAYS.find((d) => d.key === draft.dayKey) ?? BOOKING_DAYS[0]
    const time = slotRange(draft.slot)
    const courtLabel = `Court ${COURTS.findIndex((c) => c.id === court.id) + 1}`

    const host: BookingPlayer = {
      name: USER.name,
      initials: USER.initials,
      status: "host",
    }
    let players: BookingPlayer[] = [host]
    let linkedRoomId: string | undefined

    if (room) {
      players = room.players.map((init) =>
        init === USER.initials
          ? host
          : { ...playerByInitials(init), status: "going" as const }
      )
      linkedRoomId = room.id
      attachBooking(room.id, id, { day: day.label, time, venue: court.name })
    } else if (draft.fillMode === "invite") {
      players = [
        host,
        ...draft.invitees.map((init) => ({
          ...playerByInitials(init),
          status: "pending" as const,
        })),
      ]
      const rid = `r-bk-${idRef.current++}`
      addRoom(buildRoom(rid, id, court, sport, [USER.initials, ...draft.invitees]))
      linkedRoomId = rid
    } else if (draft.fillMode === "find") {
      const rid = `r-bk-${idRef.current++}`
      const newRoom = buildRoom(rid, id, court, sport, [USER.initials])
      addRoom(newRoom)
      linkedRoomId = rid
      fillRoom(newRoom)
    }

    const booking: Booking = {
      id,
      sport,
      format: draft.format,
      venue: court.name,
      court: courtLabel,
      day: day.label,
      dayKey: draft.dayKey,
      time,
      status: "confirmed",
      withPlayers: players,
      roomId: linkedRoomId,
      pricePerHour: court.pricePerHour,
    }
    setBookings((prev) => [booking, ...prev])
    toast.success(t("toast.booked"), {
      description: `${court.name} · ${day.label} · ${time}`,
    })
    setOpen(false)
  }

  const cancelBooking = (id: string) => {
    const booking = bookings.find((b) => b.id === id)
    if (booking?.roomId) detachBooking(booking.roomId)
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
    )
    toast(t("toast.cancelled"), { description: booking?.venue })
  }

  const value: BookingContextValue = {
    bookings,
    playOpen,
    openPlay,
    closePlay,
    open,
    courtId,
    roomId,
    court,
    steps,
    step,
    draft,
    capacityFor,
    openBooking,
    closeBooking,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setFormat,
    setFillMode,
    toggleInvite,
    confirmBooking,
    cancelBooking,
  }

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  )
}
