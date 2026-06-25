"use client"

import { useSession } from "@/components/dashboard/session"

export type { FillMode } from "@/components/dashboard/session"

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
    capacityFor: s.capacityFor,
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
    setFormat: s.setFormat,
    setFillMode: s.setFillMode,
    toggleInvite: s.toggleInvite,
    paying: s.paying,
    paymentResult: s.paymentResult,
    pay: s.pay,
    acknowledgePaymentSuccess: s.acknowledgePaymentSuccess,
    dismissPaymentResult: s.dismissPaymentResult,
    confirmBooking: s.confirmBooking,
    cancelBooking: s.cancelBooking,
    slotBlocked: s.slotBlocked,
    draftConflict: s.draftConflict,
    courtBusy: s.courtBusy,
    courtGaps: s.courtGaps,
  }
}
