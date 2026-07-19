import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
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

/** Largest a room's `capacity` may grow to (mirrors the web's MAX_CAPACITY). */
const MAX_CAPACITY = 8
/**
 * Most open rooms one player may host at once (mirrors the web's
 * MAX_HOSTED_ROOMS) — re-checked here as the server-side backstop since the
 * client's own cap is only a UX pre-check.
 */
const MAX_HOSTED_ROOMS = 3

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
    // An unpaid hold that timed out never became a real booking — same
    // player-facing outcome as a cancel, just no refund to simulate.
    case "cancelled":
    case "no-show":
    case "expired":
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
// ever touches the booking. Depending on BookingsService (for that read-side
// derivation) instead of VenuesService is what dissolves the old
// Sessions↔Venues forwardRef cycle.
//
// Phase 3 (VienTD-Review) demoted `PUT /api/sessions/:id` to pure room
// coordination: it used to cross-write a `booked` session straight into a
// BookingRecord (`syncBooking`/`createOrSyncAppBooking`); that now happens
// explicitly via `POST /api/bookings` (`BookingsService#createHold`,
// triggered from the web's `booking-actions.ts`), and this service just
// persists the room (roster/capacity/listing) plus whatever linkage
// (`venueId`/`reservationId`) the client already resolved from that call.
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

  /**
   * Insert or replace one of the user's sessions (keyed by the client id) —
   * pure room coordination (roster/capacity/listing/court-hold draft state).
   * Validates the room shape and the hosted-room cap, then strips the fields
   * a linked booking now exclusively owns before persisting.
   */
  async upsertSession(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    this.assertValidRoom(session)
    await this.assertHostedRoomLimit(userId, session)
    const toSave = this.stripBookingOwnedFields(session)
    await this.sessionModel.updateOne(
      { userId, sessionId: session.id },
      { $set: { data: toSave } },
      { upsert: true }
    )
    return toSave
  }

  /** Reject a room whose capacity or roster size breaks the shape invariants. */
  private assertValidRoom(session: PlaySessionData): void {
    if (session.capacity > MAX_CAPACITY) {
      throw new BadRequestException(
        `Room capacity cannot exceed ${MAX_CAPACITY}`
      )
    }
    if (session.roster.length > session.capacity) {
      throw new BadRequestException("Roster cannot exceed room capacity")
    }
  }

  /**
   * A room counts against the hosted-room cap while it's actively advertised
   * in the matchmaking pool — mirrors the web's `hostedRoomCount` memo
   * exactly (listed, not cancelled/completed). Solo court holds
   * (`listed: false`) are exempt, same as the client.
   */
  private isActiveHostedRoom(
    s: Pick<PlaySessionData, "listed" | "status">
  ): boolean {
    return s.listed && s.status !== "cancelled" && s.status !== "completed"
  }

  /** Reject a write that would push the user past MAX_HOSTED_ROOMS active listed rooms. */
  private async assertHostedRoomLimit(
    userId: string,
    incoming: PlaySessionData
  ): Promise<void> {
    if (!this.isActiveHostedRoom(incoming)) return
    const others = await this.sessionModel
      .find({ userId, sessionId: { $ne: incoming.id } })
      .select("data.listed data.status")
      .lean<{ data: Pick<PlaySessionData, "listed" | "status"> }[]>()
    const count = others.filter((o) => this.isActiveHostedRoom(o.data)).length
    if (count + 1 > MAX_HOSTED_ROOMS) {
      throw new ConflictException(
        `Bạn chỉ có thể mở tối đa ${MAX_HOSTED_ROOMS} phòng cùng lúc`
      )
    }
  }

  /**
   * `status`/`hold`/`cancelReason`/`refunded` are derived at read time from a
   * linked booking (`withBookingStatus`, above) once `reservationId` is set —
   * a client PUT can no longer set them directly (it could otherwise spoof a
   * venue decision it never made, or just go stale next to the real booking).
   * `status` still needs *a* value on the stored doc, so it's pinned to
   * "booked" — read-side derivation immediately refines it from the linked
   * booking's actual status. A session with no `reservationId` yet (still
   * forming, or a plain solo court-hold draft) is untouched: there's no
   * booking to derive from.
   */
  private stripBookingOwnedFields(session: PlaySessionData): PlaySessionData {
    if (!session.reservationId) return session
    const next: PlaySessionData = { ...session, status: "booked" }
    delete next.hold
    delete next.cancelReason
    delete next.refunded
    return next
  }

  /** Drop one of the user's sessions; throws NotFound when nothing matched. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await this.sessionModel.deleteOne({ userId, sessionId })
    if (res.deletedCount === 0) throw new NotFoundException("Session not found")
  }
}
