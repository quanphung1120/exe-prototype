import {
  combineDateTime,
  type GroupMatch,
  type PlaySession as PlaySessionData,
} from "../../shared/index.js"

// Pure projections of a stored PlaySession into the "match a group chat is
// coordinating" view — shared by `RoomsService#groupMatch` (what members see)
// and `RatingsService` (who may rate whom, and only once the match is over).

/** A court is actually held/paid for this session — not merely proposed. */
export function isSessionBooked(data: PlaySessionData): boolean {
  if (data.status === "cancelled") return false
  return (
    data.status === "booked" ||
    data.status === "completed" ||
    Boolean(data.reservationId)
  )
}

/** Epoch ms the session's slot ends, or null when no slot is set. */
export function sessionEndMs(data: PlaySessionData): number | null {
  if (data.endAt) {
    const t = Date.parse(data.endAt)
    if (Number.isFinite(t)) return t
  }
  if (!data.slot || !/^\d{4}-\d{2}-\d{2}$/.test(data.dayKey)) return null
  const start = Date.parse(combineDateTime(data.dayKey, data.slot))
  return Number.isFinite(start) ? start + data.durationMin * 60_000 : null
}

/** The match has been played: completed, or a booked slot that has ended. */
export function isSessionEnded(data: PlaySessionData, now: number): boolean {
  if (data.status === "completed") return true
  if (!isSessionBooked(data)) return false
  const end = sessionEndMs(data)
  return end !== null && end <= now
}

/**
 * Everyone who plays in the session, as Clerk ids: the host (the doc's
 * owner) plus confirmed roster members that are real users. Requested /
 * pending / declined entries and client-only mock invitees (no `userId`)
 * are excluded.
 */
export function sessionParticipantIds(
  hostUserId: string,
  data: PlaySessionData
): string[] {
  const ids = new Set<string>([hostUserId])
  for (const p of data.roster) {
    if (p.userId && (p.rsvp === "going" || p.rsvp === "host")) ids.add(p.userId)
  }
  return [...ids]
}

export function toGroupMatch(
  hostUserId: string,
  data: PlaySessionData,
  now: number
): GroupMatch {
  return {
    sessionId: data.id,
    hostUserId,
    title: data.title,
    status: data.status,
    venue: data.venue,
    courtLabel: data.courtLabel,
    dayKey: data.dayKey,
    slot: data.slot,
    durationMin: data.durationMin,
    ...(data.startAt ? { startAt: data.startAt } : {}),
    ...(data.endAt ? { endAt: data.endAt } : {}),
    ...(data.hold ? { hold: data.hold } : {}),
    ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
    booked: isSessionBooked(data),
    ended: isSessionEnded(data, now),
    participantIds: sessionParticipantIds(hostUserId, data),
  }
}
