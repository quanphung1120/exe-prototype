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
  type PlaySession as PlaySessionData,
  type SessionPlayer,
} from "../../shared/index.js"

import { NotificationsService } from "../notifications/notifications.service.js"
import { ProfileService } from "../players/profile.service.js"
import {
  PlaySession,
  type PlaySessionDocument,
} from "../sessions/session.schema.js"
import { roomChannelId, StreamService } from "../stream/stream.service.js"
import type { RoomRequestDecision } from "./rooms.dto.js"

const ORDER = { createdAt: 1, _id: 1 } as const

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
    private readonly stream: StreamService
  ) {}

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
      })
      .sort(ORDER)
      .lean()
    return docs.map((d) => d.data)
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

    const profile = await this.profiles.getProfile(userId)
    const entry: SessionPlayer = {
      name: profile.user.name,
      initials: profile.user.initials,
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
      text: `${profile.user.name} muốn tham gia phòng "${room.title}" của bạn.`,
      href: "/dashboard/play",
    })
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
        href: "/dashboard/play",
      })
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
      href: "/dashboard/play",
    })
    await this.addChatMemberBestEffort(hostUserId, roomId, targetUserId)
  }

  /**
   * A confirmed member removes themselves — the host can't use this (they'd
   * cancel/disband the room instead, via the existing session endpoints).
   */
  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const doc = await this.findRoomDoc(roomId)
    if (doc.userId === userId) {
      throw new BadRequestException(
        "Chủ phòng không thể tự rời phòng — hãy huỷ phòng thay vào đó"
      )
    }
    if (!doc.data.roster.some((p) => p.userId === userId)) {
      throw new NotFoundException("Bạn không ở trong phòng này")
    }
    await this.sessionModel.updateOne(
      { _id: doc._id },
      { $pull: { "data.roster": { userId } } }
    )
    // A member always has standing to remove themselves from the chat —
    // `removeRoomMember` skips the host-only check when memberId === userId.
    try {
      await this.stream.removeRoomMember(userId, roomChannelId(roomId), userId)
    } catch (err) {
      this.logChatFailure("leave", roomId, err)
    }
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
