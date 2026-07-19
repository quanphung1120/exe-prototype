import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  isoDateOf,
  vnNowIso,
  type PlaySession as PlaySessionData,
  type ReservationStatus,
  type SessionStatus,
} from "../../shared/index.js"

import type { Reservation } from "../../shared/index.js"

import {
  VenuesService,
  type AppReservationInput,
} from "../venues/venues.service.js"
import { PlaySession, type PlaySessionDocument } from "./session.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

/**
 * The venue cross-write surface Sessions depends on. Typing the injected param
 * as this interface (not the concrete VenuesService) keeps `emitDecoratorMetadata`
 * from baking the class into `design:paramtypes` — which, under the ESM Sessions↔
 * Venues import cycle, would be evaluated before VenuesService initializes and
 * throw. The `@Inject(forwardRef(...))` token still drives the real injection.
 */
interface VenueSyncPort {
  findVenueByCourtId(courtId: string): Promise<string | null>
  createOrSyncAppReservation(
    venueId: string,
    input: AppReservationInput
  ): Promise<Reservation>
}

/** Map a venue ReservationStatus onto the player's session status + hold. */
function mapReservationStatus(status: ReservationStatus): {
  status: SessionStatus
  hold?: "confirmed" | "pending"
} {
  switch (status) {
    case "pending":
      return { status: "booked", hold: "pending" }
    case "confirmed":
    case "checked-in":
      return { status: "booked", hold: "confirmed" }
    case "completed":
      return { status: "completed", hold: "confirmed" }
    case "cancelled":
    case "no-show":
      return { status: "cancelled" }
  }
}

// MongoDB-backed service for players' persisted PlaySessions — the durable,
// per-user mirror of the sessions a signed-in user creates or changes. Reads feed
// the seed merge (SeedService); writes are driven by the web's session actions.
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    // Cross-surface: a booked session mirrors into the owning venue's reservation.
    // forwardRef breaks the Sessions ↔ Venues cycle; the param is typed as the
    // VenueSyncPort interface (not VenuesService) so no class leaks into the
    // eagerly-evaluated decorator metadata (see VenueSyncPort).
    @Inject(forwardRef(() => VenuesService))
    private readonly venues: VenueSyncPort
  ) {}

  /** Every PlaySession this user has persisted, oldest first. */
  async listUserSessions(userId: string): Promise<PlaySessionData[]> {
    const docs = await this.sessionModel.find({ userId }).sort(ORDER).lean()
    return docs.map((d) => d.data)
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
    // Mirror a booked session on a real venue court into a pending reservation,
    // persisting the linkage back so the next PUT updates it in place.
    return this.syncReservation(userId, session)
  }

  /**
   * Cross-write a booked session into the owning venue as a pending reservation
   * (the single shared record). No-ops for sessions that aren't a real dated
   * booking on a venue court. A double-book surfaces as a ConflictException the
   * player sees; other venue errors are swallowed so the session write still holds.
   */
  private async syncReservation(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    if (session.status !== "booked" || !session.courtId || !session.slot)
      return session
    if (session.dayKey < isoDateOf(vnNowIso())) return session
    try {
      const venueId = await this.venues.findVenueByCourtId(session.courtId)
      if (!venueId) return session
      const reservation = await this.venues.createOrSyncAppReservation(venueId, {
        courtId: session.courtId,
        dayKey: session.dayKey,
        start: session.slot,
        durationMin: session.durationMin,
        userId,
        sessionId: session.id,
        customerName: session.host.name,
        reservationId: session.reservationId,
      })
      if (
        session.venueId !== venueId ||
        session.reservationId !== reservation.id
      ) {
        session.venueId = venueId
        session.reservationId = reservation.id
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

  /**
   * Apply an operator's reservation decision back onto the linked player session:
   * map the venue status to the session status/hold and, on a decline, record the
   * reason + a simulated refund. No-ops when the session no longer exists.
   */
  async applyReservationStatus(
    userId: string,
    sessionId: string,
    patch: { status: ReservationStatus; reason?: string }
  ): Promise<void> {
    const doc = await this.sessionModel.findOne({ userId, sessionId })
    if (!doc) return
    const data = doc.data
    const mapped = mapReservationStatus(patch.status)
    data.status = mapped.status
    if (mapped.hold) data.hold = mapped.hold
    else delete data.hold
    if (patch.status === "cancelled" && patch.reason) {
      data.cancelReason = patch.reason
      data.refunded = true
    } else if (patch.status === "no-show") {
      data.cancelReason = "Không đến (no-show)"
    }
    doc.markModified("data")
    await doc.save()
  }

  /** Drop one of the user's sessions; throws NotFound when nothing matched. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await this.sessionModel.deleteOne({ userId, sessionId })
    if (res.deletedCount === 0) throw new NotFoundException("Session not found")
  }
}
