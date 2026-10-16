import { randomUUID } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  activeRoster,
  initialsOf,
  vnNowIso,
  type GroupMatchResult,
  type LeaveRoomResult,
  type RoomComplaintRow,
  type PlaySession as PlaySessionData,
  type SessionPlayer,
} from "../../shared/index.js"
import { toGroupMatch } from "./group-match.js"

import { Booking, type BookingDocument } from "../bookings/booking.schema.js"
import { BookingsService } from "../bookings/bookings.service.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { ProfileService } from "../players/profile.service.js"
import {
  PlaySession,
  type PlaySessionDocument,
} from "../sessions/session.schema.js"
import { ClerkDirectoryService } from "../stream/clerk-directory.service.js"
import { roomChannelId, StreamService } from "../stream/stream.service.js"
import { RoomEventsService } from "./room-events.service.js"
import {
  RoomComplaint,
  type RoomComplaintDocument,
} from "./room-complaint.schema.js"
import type { RoomRequestDecision } from "./rooms.dto.js"

const ORDER = { createdAt: 1, _id: 1 } as const

/** Booking statuses whose court is still real — the ones a room splits the cost of. */
const LIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked-in",
  "completed",
]

function toComplaintRow(c: RoomComplaint): RoomComplaintRow {
  return {
    id: c.complaintId,
    kind: c.kind ?? "room_leave",
    roomId: c.roomId,
    roomTitle: c.roomTitle,
    bookingId: c.bookingId,
    memberUserId: c.memberUserId,
    memberName: c.memberName,
    hostUserId: c.hostUserId,
    hostName: c.hostName,
    amount: c.amount,
    reason: c.reason,
    status: c.status,
    ...(c.adminNote ? { adminNote: c.adminNote } : {}),
    ...(c.platformFunded ? { platformFunded: true } : {}),
    ...(c.venueViolations ? { venueViolations: c.venueViolations } : {}),
    createdAt: c.filedAt,
    ...(c.resolvedAt ? { resolvedAt: c.resolvedAt } : {}),
  }
}

/** A booked room's court, once the host has actually paid for it. */
interface CourtShare {
  bookingId: string
  /** VND per seat: the court price ÷ the room's max capacity, rounded up. */
  amount: number
  startAt?: string
  venue: string
}

/** How long a Clerk display name is reused before it's looked up again. */
const NAME_CACHE_MS = 5 * 60_000

/** Room statuses browsable/joinable across users — excludes historical rooms. */
const ACTIVE_ROOM_STATUSES: PlaySessionData["status"][] = ["forming", "booked"]

/**
 * Cross-user room coordination (VienTD-Review Phase 9 G2, decision #16) —
 * `PlaySession` docs are otherwise a per-owner mirror (see
 * `sessions/sessions.service.ts`), but a room *listed* for matchmaking needs
 * to be discoverable and joinable by other signed-in users, not just its
 * host. This service is the narrow, server-authorized surface for that:
 * browsing listed rooms, requesting to join, the host's approve/decline, and
 * a member leaving on their own. Every mutation targets another user's
 * document directly (by the client-generated `sessionId`, assumed globally
 * unique — see `newId` on the web side), which is exactly why this can't
 * live on the owner-scoped `SessionsService`.
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name)

  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ProfileService)
    private readonly profiles: ProfileService,
    @Inject(StreamService)
    private readonly stream: StreamService,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService,
    @Inject(RoomEventsService)
    private readonly events: RoomEventsService,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(RoomComplaint.name)
    private readonly complaintModel: Model<RoomComplaintDocument>,
    @Inject(BookingsService) private readonly bookings: BookingsService
  ) {}

  private readonly nameCache = new Map<
    string,
    { name: string; initials: string; expiresAt: number }
  >()

  /**
   * Every listed, non-demo, still-active room across all users — the
   * matchmaking browse pool. Demo seed rooms never live in this collection
   * (they're client-only fixtures), but `data.demo` is filtered defensively
   * in case a session was ever cloned from one.
   */
  async listRooms(): Promise<PlaySessionData[]> {
    const docs = await this.sessionModel
      .find({
        "data.listed": true,
        "data.demo": { $ne: true },
        "data.status": { $in: ACTIVE_ROOM_STATUSES },
        // The PUT body is stored unvalidated; a room without a roster would
        // crash every client that browses rooms.
        "data.roster": { $type: "array" },
      })
      .sort(ORDER)
      .lean()
    const names = await this.displayNames(
      docs.flatMap((d) => [
        d.userId,
        ...d.data.roster.flatMap((p) => (p.userId ? [p.userId] : [])),
      ])
    )
    const courts = await this.courtShares(docs.map((d) => d.data))
    return docs.map((d) => {
      // Stored names come from the client and older profiles carry the shared
      // demo identity ("Nguyễn Minh") — show each account's real Clerk name.
      const host = names.get(d.userId)
      const court = d.data.reservationId
        ? courts.get(d.data.reservationId)
        : undefined
      return {
        ...d.data,
        ...(court ? { sharePrice: court.amount } : {}),
        host: host ?? d.data.host,
        roster: d.data.roster.map((p) => {
          // The host's own entry is written client-side without a userId;
          // stamp it with the doc owner so a browsing player can open the
          // host's profile (and peer reviews) before deciding to join.
          if (p.rsvp === "host") {
            return { ...p, ...host, userId: p.userId ?? d.userId }
          }
          // Name only: the host's client matches incoming requests to its
          // own copy of the roster by initials, so those must stay as stored.
          const real = p.userId ? names.get(p.userId) : undefined
          return real ? { ...p, name: real.name } : p
        }),
      }
    })
  }

  /**
   * Real display names (and initials) from Clerk, keyed by user id. Cached
   * briefly since every signed-in client polls `listRooms`; a directory
   * outage just yields no entries, so callers fall back to stored names.
   */
  private async displayNames(
    ids: string[]
  ): Promise<Map<string, { name: string; initials: string }>> {
    const now = Date.now()
    const missing = [...new Set(ids)].filter(
      (id) => (this.nameCache.get(id)?.expiresAt ?? 0) <= now
    )
    if (missing.length) {
      const users = await this.directory.getMany(missing)
      for (const u of users) {
        const name = u.name.trim()
        if (!name) continue
        this.nameCache.set(u.id, {
          name,
          initials: initialsOf(name),
          expiresAt: now + NAME_CACHE_MS,
        })
      }
    }
    const out = new Map<string, { name: string; initials: string }>()
    for (const id of ids) {
      const hit = this.nameCache.get(id)
      if (hit) out.set(id, { name: hit.name, initials: hit.initials })
    }
    return out
  }

  /** Load a room by its client id, regardless of which user owns it. */
  private async findRoomDoc(roomId: string): Promise<PlaySessionDocument> {
    const doc = await this.sessionModel.findOne({ sessionId: roomId })
    if (!doc) throw new NotFoundException("Phòng không tồn tại")
    return doc
  }

  /**
   * Ask to join someone else's listed room. Mirrors the web's (pre-G2,
   * client-only) `requestJoin`: a request only takes a `requested` roster
   * seat, which doesn't count against capacity until the host approves it
   * ({@link activeRoster} excludes it) — so this only rejects when the
   * room's *confirmed* seats are already full, not when other requests are
   * pending. The requester's display name/initials come from their own
   * server-side profile (never trusted from the request body) so a roster
   * entry can't be spoofed with someone else's name.
   */
  async requestJoin(userId: string, roomId: string): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    const room = doc.data
    if (doc.userId === userId) {
      throw new BadRequestException("Bạn là chủ phòng này")
    }
    if (!room.listed || room.demo) {
      throw new ConflictException("Phòng này không mở để tham gia")
    }
    if (!ACTIVE_ROOM_STATUSES.includes(room.status)) {
      throw new ConflictException("Phòng đã đóng")
    }
    if (room.roster.some((p) => p.userId === userId)) {
      throw new ConflictException(
        "Bạn đã gửi yêu cầu hoặc đã ở trong phòng này"
      )
    }
    if (activeRoster(room).length >= room.capacity) {
      throw new ConflictException("Phòng đã đầy")
    }

    // Prefer the real Clerk name — older profiles still hold the shared demo
    // identity — and fall back to the profile when the directory is down.
    const profile = await this.profiles.getProfile(userId)
    const real = (await this.displayNames([userId])).get(userId)
    const requester = real ?? profile.user
    const entry: SessionPlayer = {
      name: requester.name,
      initials: requester.initials,
      rsvp: "requested",
      rsvpAt: Date.now(),
      userId,
    }
    await this.sessionModel.updateOne(
      { _id: doc._id },
      { $push: { "data.roster": entry } }
    )
    await this.notifications.create(doc.userId, {
      // Suffixed with a fresh id, not just `room-request-${roomId}-${userId}`:
      // a user can request → get declined (their roster entry is pulled) →
      // request again, and `NotificationsService#create` silently drops a
      // duplicate-key collision — a stable key here would swallow the second
      // request's notification to the host. (A `Date.now()` suffix isn't
      // enough — two calls in the same test/request tick can land in the
      // same millisecond — so this uses `randomUUID()`.)
      id: `room-request-${roomId}-${userId}-${randomUUID()}`,
      kind: "match",
      text: `${requester.name} muốn tham gia phòng "${room.title}" của bạn.`,
      href: "/app/play",
    })
    this.events.emit(roomId)
  }

  /**
   * The host's decision on a pending join request — the only caller allowed
   * is the room's owner (`doc.userId`). Approve re-checks capacity (seats
   * may have filled since the request was made) and adds the requester to
   * the room's real Stream chat; decline just drops their roster entry.
   * Either way the requester is notified so they learn the outcome without
   * reloading (they poll `/api/notifications`).
   */
  async decideRequest(
    hostUserId: string,
    roomId: string,
    targetUserId: string,
    decision: RoomRequestDecision
  ): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId !== hostUserId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền duyệt yêu cầu")
    }
    const room = doc.data
    const entry = room.roster.find(
      (p) => p.userId === targetUserId && p.rsvp === "requested"
    )
    if (!entry) throw new NotFoundException("Yêu cầu tham gia không tồn tại")

    if (decision === "decline") {
      await this.sessionModel.updateOne(
        { _id: doc._id },
        { $pull: { "data.roster": { userId: targetUserId } } }
      )
      await this.notifications.create(targetUserId, {
        // Suffixed for the same reason as `requestJoin`'s notification — a
        // request→decline→request→decline cycle would otherwise reuse the
        // same dedupe key and the second decline notification would be
        // silently swallowed.
        id: `room-declined-${roomId}-${targetUserId}-${randomUUID()}`,
        kind: "match",
        text: `Chủ phòng đã từ chối yêu cầu tham gia "${room.title}".`,
        href: "/app/play",
      })
      this.events.emit(roomId)
      await this.removeChatMemberBestEffort(hostUserId, roomId, targetUserId)
      return
    }

    if (activeRoster(room).length >= room.capacity) {
      throw new ConflictException("Phòng đã đầy")
    }
    const res = await this.sessionModel.updateOne(
      {
        _id: doc._id,
        "data.roster": {
          $elemMatch: { userId: targetUserId, rsvp: "requested" },
        },
      },
      { $set: { "data.roster.$.rsvp": "going" } }
    )
    if (res.matchedCount === 0) {
      throw new ConflictException("Yêu cầu tham gia đã được xử lý")
    }
    await this.notifications.create(targetUserId, {
      // Suffixed for the same reason as the request/decline ids above —
      // leaving and rejoining (or a decline→re-request→approve cycle) must
      // not reuse a dedupe key an earlier approval already claimed.
      id: `room-approved-${roomId}-${targetUserId}-${randomUUID()}`,
      kind: "match",
      text: `Chủ phòng đã duyệt yêu cầu tham gia "${room.title}" của bạn.`,
      href: "/app/play",
    })
    this.events.emit(roomId)
    await this.addChatMemberBestEffort(hostUserId, roomId, targetUserId)
  }

  /**
   * A confirmed member leaves at once. The court cost is split between the
   * players themselves (the app only shows each share), so there is nothing to
   * approve. The host can't use this — they cancel the room instead.
   */
  async leaveRoom(userId: string, roomId: string): Promise<LeaveRoomResult> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId === userId) {
      throw new BadRequestException(
        "Chủ phòng không thể tự rời phòng — hãy huỷ phòng thay vào đó"
      )
    }
    if (!doc.data.roster.some((p) => p.userId === userId)) {
      throw new NotFoundException("Bạn không ở trong phòng này")
    }

    await this.dropMember(doc, userId)
    return { status: "left" }
  }

  /** Pull a member off the roster and out of the room chat. */
  private async dropMember(
    doc: PlaySessionDocument,
    memberId: string
  ): Promise<void> {
    const roomId = doc.sessionId
    await this.sessionModel.updateOne(
      { _id: doc._id },
      { $pull: { "data.roster": { userId: memberId } } }
    )
    this.events.emit(roomId)
    // A member always has standing to remove themselves from the chat —
    // `removeRoomMember` skips the host-only check when memberId === userId.
    try {
      await this.stream.removeRoomMember(
        memberId,
        roomChannelId(roomId),
        memberId
      )
    } catch (err) {
      this.logChatFailure("leave", roomId, err)
    }
  }

  /** Every complaint, open ones first then newest — the admin worklist. */
  async listComplaints(): Promise<RoomComplaintRow[]> {
    const docs = await this.complaintModel
      .find()
      .sort({ createdAt: -1 })
      .lean<RoomComplaint[]>()
    const rows = docs.map(toComplaintRow)
    return [
      ...rows.filter((r) => r.status === "open"),
      ...rows.filter((r) => r.status !== "open"),
    ]
  }

  /**
   * An admin closes a complaint with a note. `resolve` = looked into and dealt
   * with (e.g. the venue was contacted); `dismiss` = not upheld. No money
   * moves through the platform, so there is nothing to refund here.
   */
  async resolveComplaint(
    complaintId: string,
    decision: "resolve" | "dismiss",
    note?: string
  ): Promise<RoomComplaintRow> {
    const complaint = await this.complaintModel.findOne({ complaintId })
    if (!complaint) throw new NotFoundException("Khiếu nại không tồn tại")
    if (complaint.status !== "open") {
      throw new ConflictException("Khiếu nại này đã được xử lý")
    }
    complaint.status = decision === "resolve" ? "resolved" : "dismissed"
    complaint.adminNote = note?.trim() || undefined
    complaint.resolvedAt = vnNowIso()
    await complaint.save()

    const outcome =
      decision === "resolve"
        ? "đã được quản trị viên xử lý"
        : "không được chấp nhận"
    const tail = note ? ` Ghi chú: ${note.trim()}` : ""
    await this.notifications
      .create(complaint.memberUserId, {
        id: `room-complaint-resolved-${complaintId}`,
        kind: "match",
        text: `Khiếu nại về "${complaint.roomTitle}" ${outcome}.${tail}`,
        href: "/app/bookings",
      })
      .catch(() => undefined)
    if (
      decision === "resolve" &&
      complaint.hostUserId !== complaint.bookingId
    ) {
      await this.notifications
        .create(complaint.hostUserId, {
          id: `room-complaint-host-${complaintId}`,
          kind: "match",
          text: `Khiếu nại của ${complaint.memberName} về "${complaint.roomTitle}" đã được quản trị viên xử lý.${tail}`,
          href: "/app/play",
        })
        .catch(() => undefined)
    }
    return toComplaintRow(complaint)
  }

  /**
   * The host cancels (disbands) their room. A still-forming room is deleted
   * outright; one with a linked booking is kept as history but delisted and
   * marked cancelled (the caller cancels the booking itself first, via
   * `POST /api/bookings/:id/cancel`, which owns the refund). Either way it
   * drops out of `listRooms`, so every client sees it vanish on its next
   * poll, and each member/pending requester is notified.
   */
  async disbandRoom(userId: string, roomId: string): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId !== userId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền huỷ phòng")
    }
    const room = doc.data
    if (room.reservationId) {
      await this.sessionModel.updateOne(
        { _id: doc._id },
        { $set: { "data.listed": false, "data.status": "cancelled" } }
      )
    } else {
      await this.sessionModel.deleteOne({ _id: doc._id })
    }

    const memberIds = new Set(
      (room.roster ?? []).flatMap((p) =>
        p.rsvp !== "host" && p.userId && p.userId !== userId ? [p.userId] : []
      )
    )
    // A failed notification must never undo the disband itself.
    await Promise.all(
      [...memberIds].map((memberId) =>
        this.notifications
          .create(memberId, {
            id: `room-disbanded-${roomId}-${memberId}-${randomUUID()}`,
            kind: "match",
            text: `Chủ phòng đã huỷ phòng "${room.title}".`,
            href: "/app/play",
          })
          .catch((err: unknown) => {
            this.logger.error(
              `Disband notification failed for room ${roomId}`,
              err instanceof Error ? err.stack : String(err)
            )
          })
      )
    )
    this.events.emit(roomId)
  }

  // ── Court cost sharing ───────────────────────────────────────────────────────

  /** Court share per booking id, for the rooms whose court is paid for. */
  private async courtShares(
    rooms: PlaySessionData[]
  ): Promise<Map<string, CourtShare>> {
    const ids = rooms.flatMap((r) =>
      r.status === "booked" && r.reservationId ? [r.reservationId] : []
    )
    const out = new Map<string, CourtShare>()
    if (!ids.length) return out
    const bookings = await this.bookingModel
      .find({ bookingId: { $in: ids } })
      .select("bookingId price paymentStatus status startAt")
      .lean<
        Pick<
          Booking,
          "bookingId" | "price" | "paymentStatus" | "status" | "startAt"
        >[]
      >()
    const byId = new Map(bookings.map((b) => [b.bookingId, b]))
    for (const room of rooms) {
      const b = room.reservationId ? byId.get(room.reservationId) : undefined
      if (
        !b ||
        b.paymentStatus !== "paid" ||
        !LIVE_BOOKING_STATUSES.includes(b.status)
      ) {
        continue
      }
      out.set(b.bookingId, {
        bookingId: b.bookingId,
        amount: Math.ceil(b.price / Math.max(1, room.capacity)),
        startAt: b.startAt,
        venue: room.venue,
      })
    }
    return out
  }

  private async courtShareOf(
    room: PlaySessionData
  ): Promise<CourtShare | null> {
    const map = await this.courtShares([room])
    return (room.reservationId && map.get(room.reservationId)) || null
  }

  /** Take a seat's share from the member and park it until the host answers. */
  /** Move a held share into the host's wallet. Idempotent. */
  /** Return a held share to the member. Idempotent. */
  /** Refund every live share a member has in a room; tell them if one can't be. */
  /** `GET /api/rooms/:id/shares` — who has paid their part (host and members only). */
  /**
   * The host marks a member as having paid their court share. Idempotent —
   * calling it again on an already-paid member is a no-op.
   */
  async markMemberPaid(
    hostUserId: string,
    roomId: string,
    memberUserId: string
  ): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId !== hostUserId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền xác nhận thanh toán")
    }
    const member = doc.data.roster.find(
      (p) => p.userId === memberUserId && p.rsvp !== "host"
    )
    if (!member) throw new NotFoundException("Thành viên không tồn tại trong phòng")
    await this.sessionModel.updateOne(
      { _id: doc._id, "data.roster": { $elemMatch: { userId: memberUserId } } },
      { $set: { "data.roster.$.paid": true } }
    )
    this.events.emit(roomId)
    await this.notifications
      .create(memberUserId, {
        id: `room-paid-confirmed-${roomId}-${memberUserId}`,
        kind: "match",
        text: `Chủ phòng đã xác nhận bạn đã thanh toán phần sân cho phòng "${doc.data.title}".`,
        href: "/app/play",
      })
      .catch(() => undefined)
  }

  /**
   * The host sends a payment reminder notification to a member who hasn't
   * paid their share yet. Each call sends a fresh notification (UUID suffix).
   */
  async remindMember(
    hostUserId: string,
    roomId: string,
    memberUserId: string
  ): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId !== hostUserId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền gửi nhắc nhở")
    }
    const member = doc.data.roster.find(
      (p) => p.userId === memberUserId && p.rsvp !== "host"
    )
    if (!member) throw new NotFoundException("Thành viên không tồn tại trong phòng")
    const court = await this.courtShareOf(doc.data)
    const amountPart = court ? ` ${court.amount.toLocaleString("vi-VN")}đ` : ""
    const hostProfile = await this.profiles.getProfile(hostUserId)
    const phonePart = hostProfile.phone
      ? ` Liên hệ SĐT ${hostProfile.phone} để chuyển khoản.`
      : ""
    await this.notifications.create(memberUserId, {
      id: `room-remind-${roomId}-${memberUserId}-${randomUUID()}`,
      kind: "match",
      text: `Chủ phòng nhắc bạn chuyển${amountPart} tiền chia sẻ sân cho phòng "${doc.data.title}".${phonePart}`,
      href: "/app/play",
    })
  }

  /**
   * The match a group chat is coordinating, readable by any member of the
   * chat (not just the host who owns the session doc). A room chat
   * (`room-<id>`) maps to its room; a community group maps to the latest
   * non-cancelled session booked from it (`data.chatChannelId`). `canBook`
   * says whether the caller may start/finish booking a court now — only the
   * group's owner: the chat's creator while the group has no live match, or
   * the match's host while it isn't booked yet. Other members wait for them.
   */
  async groupMatch(
    userId: string,
    channelId: string
  ): Promise<GroupMatchResult> {
    const membership = await this.stream.assertMember(userId, channelId)
    const doc = await this.findChannelSessionDoc(channelId)
    if (!doc) {
      return {
        match: null,
        canBook:
          (channelId.startsWith("group-") || channelId.startsWith("room-")) &&
          membership.createdBy === userId,
      }
    }
    const match = toGroupMatch(doc.userId, doc.data, Date.now())
    return {
      match,
      canBook:
        match.status !== "cancelled" &&
        !match.booked &&
        match.hostUserId === userId,
    }
  }

  /** The session behind a group chat, or null — see {@link groupMatch}. */
  async findChannelSessionDoc(
    channelId: string
  ): Promise<PlaySessionDocument | null> {
    if (channelId.startsWith("room-")) {
      // Only the host persists a room, but a defensive oldest-first sort keeps
      // the pick deterministic should a stray copy ever exist.
      const room = await this.sessionModel
        .findOne({ sessionId: channelId.slice("room-".length) })
        .sort(ORDER)
        .lean<PlaySessionDocument>()
      // A disbanded room's chat outlives it; a match the host then books from
      // that chat links back via `chatChannelId`, like a community group's.
      if (room) return room
    }
    return this.sessionModel
      .findOne({
        "data.chatChannelId": channelId,
        "data.status": { $ne: "cancelled" },
      })
      .sort({ createdAt: -1, _id: -1 })
      .lean<PlaySessionDocument>()
  }

  /** Best-effort: add the newly-approved member to the room's real chat. */
  private async addChatMemberBestEffort(
    hostUserId: string,
    roomId: string,
    memberId: string
  ): Promise<void> {
    try {
      await this.stream.addRoomMember(
        hostUserId,
        roomChannelId(roomId),
        memberId
      )
    } catch (err) {
      this.logChatFailure("approve", roomId, err)
    }
  }

  /** Best-effort: drop a declined requester from the chat, if they'd been added. */
  private async removeChatMemberBestEffort(
    hostUserId: string,
    roomId: string,
    memberId: string
  ): Promise<void> {
    try {
      await this.stream.removeRoomMember(
        hostUserId,
        roomChannelId(roomId),
        memberId
      )
    } catch (err) {
      this.logChatFailure("decline", roomId, err)
    }
  }

  // A chat-lifecycle hiccup (misconfigured Stream, a room with no chat
  // channel yet) must never fail the roster decision itself — log loudly and
  // move on, matching `StreamService#freezeChannelById`'s best-effort note.
  private logChatFailure(op: string, roomId: string, err: unknown): void {
    this.logger.error(
      `Room chat ${op} failed for room ${roomId}`,
      err instanceof Error ? err.stack : String(err)
    )
  }
}
