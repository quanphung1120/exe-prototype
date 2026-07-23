"use client"

import { useSession } from "@/features/play/session"

export type { FillMode } from "@/features/play/session"

/**
 * Back-compat facade over the unified {@link useSession} store. The Play
 * chooser, booking wizard and Bookings view consume this and keep working
 * against the legacy `Booking` shape via projections.
 */
export function useBooking() {
  const s = useSession()
  return {
    bookings: s.bookings,
    sessions: s.sessions,
    playOpen: s.playOpen,
    openPlay: s.openPlay,
    closePlay: s.closePlay,
    open: s.open,
    courtId: s.courtId,
    roomId: s.roomId,
    court: s.court,
    steps: s.steps,
    step: s.step,
    draft: s.draft,
    openBooking: s.openBooking,
    armBooking: s.armBooking,
    bookCourtForSession: s.bookCourtForSession,
    addTeamToSession: s.addTeamToSession,
    rebookFrom: s.rebookFrom,
    closeBooking: s.closeBooking,
    next: s.next,
    back: s.back,
    setCourt: s.setCourt,
    setDay: s.setDay,
    setSlot: s.setSlot,
    setDuration: s.setDuration,
    pickSlot: s.pickSlot,
    setFillMode: s.setFillMode,
    toggleInvite: s.toggleInvite,
    paying: s.paying,
    checkoutError: s.checkoutError,
    clearCheckoutError: s.clearCheckoutError,
    pay: s.pay,
    cancelBooking: s.cancelBooking,
    slotBlocked: s.slotBlocked,
    draftConflict: s.draftConflict,
    courtBusy: s.courtBusy,
    courtGaps: s.courtGaps,
  }
}
