import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  isoDateOf,
  vnNowIso,
  type BookingRecordStatus,
  type PlaySession as PlaySessionData,
  type SessionStatus,
} from "../../shared/index.js"

import {
  BookingsService,
  type BookingStatusInfo,
} from "../bookings/bookings.service.js"
import { PlaySession, type PlaySessionDocument } from "./session.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

/** Map a linked booking's status onto the player's session status + hold. */
function mapBookingStatus(status: BookingRecordStatus): {
  status: SessionStatus
  hold?: "confirmed" | "pending"
} {
  switch (status) {
    case "awaiting_payment":
    case "pending":
      return { status: "booked", hold: "pending" }
    case "confirmed":
    case "checked-in":
      return { status: "booked", hold: "confirmed" }
    case "completed":
      return { status: "completed", hold: "confirmed" }
    case "expired":
    case "cancelled":
    case "no-show":
      return { status: "cancelled" }
  }
}

// MongoDB-backed service for players' persisted PlaySessions — the durable,
// per-user mirror of the sessions a signed-in user creates or changes. Reads feed
// the seed merge (SeedService); writes are driven by the web's session actions.
//
// A booked session's status/hold/refund is *derived* at read time from its
// linked BookingRecord (see `listUserSessions`/`withBookingStatus`) rather than
// pushed onto the session doc by the venue side — the operator decision only
// ever touches the booking. That, plus depending on BookingsService instead of
// VenuesService for the create-side cross-write, is what dissolves the old
// Sessions↔Venues forwardRef cycle.
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    // Explicit token (not just the TS type) since esbuild-based runners like
    // tsx don't emit the design:paramtypes metadata Nest's implicit
    // constructor-injection would otherwise rely on — see
    // test/sessions-service.test.ts.
    @Inject(BookingsService) private readonly bookings: BookingsService
  ) {}

  /** Every PlaySession this user has persisted, oldest first. */
  async listUserSessions(userId: string): Promise<PlaySessionData[]> {
    const docs = await this.sessionModel.find({ userId }).sort(ORDER).lean()
    const linkedIds = docs
      .map((d) => d.data.reservationId)
      .filter((id): id is string => Boolean(id))
    const statuses = await this.bookings.statusFor(linkedIds)
    return docs.map((d) => this.withBookingStatus(d.data, statuses))
  }

  /**
   * Overlay a session with its linked booking's current status/hold/refund, if
   * it has one. No-ops for sessions with no linked booking (forming, or a
   * legacy record predating the bookings collection) — they keep whatever the
   * client last wrote.
   */
  private withBookingStatus(
    session: PlaySessionData,
    statuses: Map<string, BookingStatusInfo>
  ): PlaySessionData {
    const info = session.reservationId
      ? statuses.get(session.reservationId)
      : undefined
    if (!info) return session
    const mapped = mapBookingStatus(info.status)
    const next: PlaySessionData = { ...session, status: mapped.status }
    if (mapped.hold) next.hold = mapped.hold
    else delete next.hold
    if (info.status === "cancelled") {
      next.cancelReason = info.declineReason ?? info.cancelReason
      next.refunded =
        info.paymentStatus === "refunded" ||
        info.paymentStatus === "partial_refund"
    } else if (info.status === "no-show") {
      next.cancelReason = "Không đến (no-show)"
    }
    return next
  }

  /** Insert or replace one of the user's sessions (keyed by the client id). */
  async upsertSession(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    await this.sessionModel.updateOne(
      { userId, sessionId: session.id },
      { $set: { data: session } },
      { upsert: true }
    )
    // Mirror a booked session on a real venue court into a booking, persisting
    // the linkage back so the next PUT updates it in place.
    return this.syncBooking(userId, session)
  }

  /**
   * Cross-write a booked session into its owning venue as a booking (the single
   * shared record). No-ops for sessions that aren't a real dated booking on a
   * venue court. A double-book surfaces as a ConflictException the player sees;
   * other errors are swallowed so the session write still holds.
   */
  private async syncBooking(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    if (session.status !== "booked" || !session.courtId || !session.slot)
      return session
    if (session.dayKey < isoDateOf(vnNowIso())) return session
    try {
      const synced = await this.bookings.createOrSyncAppBooking({
        courtId: session.courtId,
        dayKey: session.dayKey,
        start: session.slot,
        durationMin: session.durationMin,
        userId,
        sessionId: session.id,
        customerName: session.host.name,
        bookingId: session.reservationId,
      })
      if (!synced) return session
      if (
        session.venueId !== synced.venueId ||
        session.reservationId !== synced.reservation.id
      ) {
        session.venueId = synced.venueId
        session.reservationId = synced.reservation.id
        await this.sessionModel.updateOne(
          { userId, sessionId: session.id },
          { $set: { data: session } }
        )
      }
      return session
    } catch (err) {
      if (err instanceof ConflictException) throw err
      return session
    }
  }

  /** Drop one of the user's sessions; throws NotFound when nothing matched. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await this.sessionModel.deleteOne({ userId, sessionId })
    if (res.deletedCount === 0) throw new NotFoundException("Session not found")
  }
}
