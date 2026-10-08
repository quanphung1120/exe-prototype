import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { createHash, randomUUID } from "node:crypto"
import type { Model } from "mongoose"
import type { StreamChat } from "stream-chat"

import { Booking, type BookingDocument } from "../bookings/booking.schema.js"
import { Brand, type BrandDocument } from "../brands/brand.schema.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { ClerkDirectoryService } from "./clerk-directory.service.js"

// stream-chat v9 treats a channel's `name` as a custom field (the base
// `CustomChannelData` is empty), so declare the display name we set on channels.
declare module "stream-chat" {
  interface CustomChannelData {
    name?: string
    /** Owning venue of a player↔venue chat (absent on all other channels). */
    venueId?: string
    /** Owning brand of a player↔venue chat, when the venue belongs to one. */
    brandId?: string
  }
}

/** DI token for the shared server-side StreamChat client (faked in tests). */
export const STREAM_CLIENT = Symbol("STREAM_CLIENT")

/** Channel id for a room's real chat — mirrors the web's `roomChannelId`. */
export const roomChannelId = (roomId: string) => `room-${roomId}`

/** Upper bound on a community group's size (creator included). */
export const MAX_GROUP_MEMBERS = 16

/**
 * A group conversation (vs a DM or a player↔venue chat): a community group,
 * a room chat, or any channel with 3+ members.
 */
export function isGroupChannel(
  channelId: string,
  membership: { memberIds: string[]; isVenueChat: boolean }
): boolean {
  if (membership.isVenueChat || channelId.startsWith("dm-")) return false
  return (
    channelId.startsWith("group-") ||
    channelId.startsWith("room-") ||
    membership.memberIds.length > 2
  )
}

/** Deterministic DM channel id for a user pair (order-independent). */
export const dmChannelId = (a: string, b: string) =>
  `dm-${createHash("sha256").update([a, b].sort().join(":")).digest("hex").slice(0, 40)}`

/** Deterministic per-(player, venue) chat channel id. */
export const venueChannelId = (venueId: string, userId: string) =>
  `venue-${createHash("sha256").update(`${venueId}:${userId}`).digest("hex").slice(0, 40)}`

/**
 * Deterministic per-(player, brand) chat channel id — one chat with an owner
 * however many of their branches the player books. Shares the `venue-` prefix
 * (and hash space, keyed `brand:<id>`) so every venue-chat check still applies.
 */
export const brandChannelId = (brandId: string, userId: string) =>
  venueChannelId(`brand:${brandId}`, userId)

// Server-side Stream Chat integration. Signs per-user JWTs (a local operation)
// and keeps the caller's Stream user in sync with their Clerk name/avatar.
// Also gets-or-creates match-room/team channels on demand.
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name)

  constructor(
    @Inject(STREAM_CLIENT) private readonly client: StreamChat,
    @InjectModel(Venue.name) private readonly venues: Model<VenueDocument>,
    @InjectModel(Booking.name)
    private readonly bookings: Model<BookingDocument>,
    @InjectModel(Brand.name) private readonly brands: Model<BrandDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  /**
   * A Stream credentials pair for the signed-in user: the app key (handed to the
   * web client) and a freshly signed user token. Upserts the caller's Stream
   * user first. `createToken` is a local JWT sign — cheap to run per request.
   */
  async issueToken(
    userId: string,
    name?: string,
    image?: string
  ): Promise<{ apiKey: string; token: string }> {
    await this.upsertSelf(userId, name, image)
    // 24h bounds the life of a leaked token; the web client refreshes via its
    // token provider, so a short-lived token costs nothing in UX.
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
    return {
      apiKey: this.client.key,
      token: this.client.createToken(userId, exp),
    }
  }

  /**
   * Upsert the caller's own Stream user so their name/avatar track Clerk.
   * Runs on every token issue — cheap and idempotent. A failure is logged and
   * swallowed: the token is still issued, chat just shows a stale name.
   */
  private async upsertSelf(
    userId: string,
    name?: string,
    image?: string
  ): Promise<void> {
    try {
      await this.client.upsertUsers([
        { id: userId, name: name || "Người chơi", ...(image ? { image } : {}) },
      ])
    } catch (err) {
      this.logger.error(
        `Failed to upsert Stream user ${userId}`,
        err instanceof Error ? err.stack : String(err)
      )
    }
  }

  // ── Real room-chat lifecycle (quyết định #13, mock seeding removed Phase 9
  // G2) ─────────────────────────────────────────────────────────────────
  // Only real members are ever added, and every mutation is authorized
  // against the channel's `created_by` (the host) — the only room model we
  // had until Phase 9 G2 landed a server-side room with real membership
  // (`features/rooms/`). The old `ensureRoomChannel` (get-or-create a
  // channel seeded with mock `MATCH_SUGGESTIONS` players) was removed here:
  // decision #10 says mock liquidity must never enter a real transaction,
  // and a real chat channel is one.

  /**
   * Create a room's chat with only the host as a member — never mocks. Safe
   * to call once per room, right when it's created (not lazily on first
   * open). `channel.create()` is idempotent on an existing id, so re-opening
   * a room chat is safe.
   */
  async createRoomChannel(
    userId: string,
    input: { id: string; name: string }
  ): Promise<{ id: string }> {
    await this.client.upsertUsers([{ id: userId }])
    const channel = this.client.channel("messaging", input.id, {
      name: input.name,
      created_by_id: userId,
      members: [userId],
    })
    await channel.create()
    return { id: input.id }
  }

  /** The Stream-recorded creator (host) of a room channel, or null. */
  private async channelOwner(channelId: string): Promise<string | null> {
    const channel = this.client.channel("messaging", channelId)
    try {
      const state = await channel.query({
        state: false,
        watch: false,
        presence: false,
      })
      return state.channel.created_by?.id ?? state.channel.created_by_id ?? null
    } catch (err) {
      const status =
        (err as { status?: number; StatusCode?: number })?.status ??
        (err as { status?: number; StatusCode?: number })?.StatusCode
      if (status === 404)
        throw new NotFoundException("Phòng chat không tồn tại")
      throw err
    }
  }

  /** Throws unless `userId` is the room's host (its channel `created_by`). */
  private async assertHost(userId: string, channelId: string): Promise<void> {
    const createdBy = await this.channelOwner(channelId)
    if (createdBy !== userId) {
      throw new ForbiddenException(
        "Chỉ chủ phòng mới có quyền thực hiện thao tác này"
      )
    }
  }

  /** Host adds a real (non-mock) member to a room's chat — e.g. on approve. */
  async addRoomMember(
    userId: string,
    channelId: string,
    memberId: string
  ): Promise<void> {
    await this.assertHost(userId, channelId)
    await this.client.upsertUsers([{ id: memberId }])
    await this.client.channel("messaging", channelId).addMembers([memberId])
  }

  /**
   * Remove a member from a room's chat — kick/decline (host-only) or a
   * member leaving on their own (always allowed to remove themselves).
   */
  async removeRoomMember(
    userId: string,
    channelId: string,
    memberId: string
  ): Promise<void> {
    if (memberId !== userId) await this.assertHost(userId, channelId)
    await this.client.channel("messaging", channelId).removeMembers([memberId])
  }

  /** Host freezes their room's chat (cancel) — keeps history, blocks sends. */
  async freezeRoomChannel(userId: string, channelId: string): Promise<void> {
    await this.assertHost(userId, channelId)
    await this.freezeChannelById(channelId)
  }

  /**
   * System-initiated freeze with no caller to authorize — used by the venue
   * cancel/decline hook, which freezes on the operator's decision rather than
   * the host's. Best-effort from the caller's side: never let a chat failure
   * block a booking decision.
   */
  async freezeChannelById(channelId: string): Promise<void> {
    await this.client
      .channel("messaging", channelId)
      .updatePartial({ set: { frozen: true } })
  }

  // ── Group management (rename / add members) ─────────────────────────────
  // Shared by community groups (`group-*`) and room chats (`room-*`). Room
  // membership itself still flows through `RoomsService` (join/approve/
  // leave); only community groups take members added directly here.

  /**
   * A channel's creator, member ids and kind — the one read every group
   * mutation authorizes against. Throws 404 for an unknown channel.
   */
  async channelMembership(channelId: string): Promise<{
    createdBy: string | null
    memberIds: string[]
    isVenueChat: boolean
  }> {
    const channel = this.client.channel("messaging", channelId)
    try {
      const state = await channel.query({
        state: true,
        watch: false,
        presence: false,
        messages: { limit: 0 },
      })
      return {
        createdBy:
          state.channel.created_by?.id ?? state.channel.created_by_id ?? null,
        memberIds: (state.members ?? [])
          .map((m) => m.user_id ?? m.user?.id)
          .filter((id): id is string => Boolean(id)),
        isVenueChat: Boolean(state.channel.venueId),
      }
    } catch (err) {
      const status =
        (err as { status?: number; StatusCode?: number })?.status ??
        (err as { status?: number; StatusCode?: number })?.StatusCode
      if (status === 404)
        throw new NotFoundException("Cuộc trò chuyện không tồn tại")
      throw err
    }
  }

  /** {@link channelMembership}, throwing 403 unless `userId` is a member. */
  async assertMember(userId: string, channelId: string) {
    const membership = await this.channelMembership(channelId)
    if (!membership.memberIds.includes(userId)) {
      throw new ForbiddenException("Bạn không có trong cuộc trò chuyện này")
    }
    return membership
  }

  /**
   * Rename a group chat. Any member may (Messenger/Zalo-style); DMs and venue
   * chats have no editable name — they're titled by the other party.
   */
  async renameGroup(
    userId: string,
    channelId: string,
    name: string
  ): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new BadRequestException("Tên nhóm không được để trống")
    const membership = await this.assertMember(userId, channelId)
    if (!isGroupChannel(channelId, membership)) {
      throw new BadRequestException("Chỉ có thể đổi tên nhóm trò chuyện")
    }
    await this.client
      .channel("messaging", channelId)
      .updatePartial({ set: { name: trimmed } })
  }

  /**
   * Add real users to a community group — the group's creator only. Room
   * chats are excluded: their members come from the room roster (join
   * request → host approval), which this would bypass.
   */
  async addGroupMembers(
    userId: string,
    channelId: string,
    memberIds: string[]
  ): Promise<void> {
    if (!channelId.startsWith("group-")) {
      throw new BadRequestException(
        "Chỉ có thể thêm thành viên vào nhóm trò chuyện"
      )
    }
    const membership = await this.channelMembership(channelId)
    if (membership.createdBy !== userId) {
      throw new ForbiddenException("Chỉ chủ nhóm mới có quyền thêm thành viên")
    }
    const ids = [...new Set(memberIds)].filter(
      (id) => !membership.memberIds.includes(id)
    )
    if (!ids.length) return
    if (membership.memberIds.length + ids.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`
      )
    }
    const users = await this.directory.getMany(ids)
    if (users.length !== ids.length) {
      throw new NotFoundException("Không tìm thấy người dùng")
    }
    await this.client.upsertUsers(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        ...(u.image ? { image: u.image } : {}),
      }))
    )
    await this.client.channel("messaging", channelId).addMembers(ids)
  }

  /**
   * Delete a group chat for everyone. Unlike {@link leaveConversation} (the
   * caller alone drops out), this removes the channel and its history for
   * every member. Allowed for a community group's creator, or for whoever is
   * the last member left in a group or room chat — leaving alone would only
   * strand an empty chat. A room chat otherwise follows its play room
   * (cancelling the room freezes the chat), so its host can't delete it
   * while others are still in it.
   */
  async deleteGroup(userId: string, channelId: string): Promise<void> {
    const isRoomChat = channelId.startsWith("room-")
    if (!channelId.startsWith("group-") && !isRoomChat) {
      throw new BadRequestException("Chỉ có thể xoá nhóm trò chuyện")
    }
    const membership = await this.channelMembership(channelId)
    const lastMember =
      membership.memberIds.length === 1 && membership.memberIds[0] === userId
    if (isRoomChat && !lastMember) {
      throw new ForbiddenException(
        "Chỉ có thể xoá nhóm phòng khi bạn là thành viên cuối cùng"
      )
    }
    if (!isRoomChat && membership.createdBy !== userId && !lastMember) {
      throw new ForbiddenException("Chỉ chủ nhóm mới có quyền xoá nhóm")
    }
    await this.client.channel("messaging", channelId).delete()
  }

  // ── Community chat: DMs/groups + venue chat ──────────────────────────────
  // Every real user chat any user can start with any other real user (found
  // via ClerkDirectoryService), plus a player's channel with a venue's real
  // owner account — gated on a paid booking there. Never mixes in mock/demo
  // identities.

  /**
   * Start (or reopen) a DM with one other user, or a named group chat with
   * several. `channel.create()` is idempotent get-or-create, so calling this
   * again with the same member(s) is safe and lands in the same channel.
   */
  async createConversation(
    userId: string,
    input: { memberIds: string[]; name?: string }
  ): Promise<{ id: string }> {
    const memberIds = [...new Set(input.memberIds)].filter(
      (id) => id !== userId
    )
    if (!memberIds.length) {
      throw new BadRequestException("Chọn ít nhất một người để trò chuyện")
    }

    const users = await this.directory.getMany(memberIds)
    if (users.length !== memberIds.length) {
      throw new NotFoundException("Không tìm thấy người dùng")
    }

    await this.client.upsertUsers([
      { id: userId },
      ...users.map((u) => ({
        id: u.id,
        name: u.name,
        ...(u.image ? { image: u.image } : {}),
      })),
    ])

    if (memberIds.length === 1) {
      const id = dmChannelId(userId, memberIds[0])
      const channel = this.client.channel("messaging", id, {
        created_by_id: userId,
        members: [userId, memberIds[0]],
      })
      await channel.create()
      return { id }
    }

    if (!input.name) {
      throw new BadRequestException("Nhóm cần có tên")
    }
    const id = `group-${randomUUID().replaceAll("-", "")}`
    const channel = this.client.channel("messaging", id, {
      name: input.name,
      created_by_id: userId,
      members: [userId, ...memberIds],
    })
    await channel.create()
    return { id }
  }

  /**
   * Remove one of the caller's own conversations from their list. Behaviour
   * depends on the channel, but it's always the *caller* who's removed —
   * never anyone else — so no host/creator check is needed (a user may always
   * remove their own conversation):
   *
   * - **Group** (3+ members) → *leave*: the caller is removed from membership;
   *   everyone else keeps the group and its full history.
   * - **DM / 1:1 chat** (≤2 members, e.g. a direct message or a player↔venue
   *   chat) → *delete for me only*: the channel is hidden for the caller with
   *   their history cleared. The other member is untouched, and the thread
   *   reappears on the caller's side if a new message is sent to it — the
   *   conventional "delete conversation" behaviour of a messenger.
   */
  async leaveConversation(userId: string, channelId: string): Promise<void> {
    const channel = this.client.channel("messaging", channelId)

    let members: { user_id?: string; user?: { id?: string } }[]
    try {
      const state = await channel.query({
        state: true,
        watch: false,
        presence: false,
      })
      members = state.members ?? []
    } catch (err) {
      const status =
        (err as { status?: number; StatusCode?: number })?.status ??
        (err as { status?: number; StatusCode?: number })?.StatusCode
      if (status === 404)
        throw new NotFoundException("Cuộc trò chuyện không tồn tại")
      throw err
    }

    const isMember = members.some((m) => (m.user_id ?? m.user?.id) === userId)
    if (!isMember) {
      throw new ForbiddenException("Bạn không có trong cuộc trò chuyện này")
    }

    if (members.length > 2) {
      // Group → leave: removed from membership, others keep the group.
      await channel.removeMembers([userId])
    } else {
      // DM / 1:1 chat → delete for me only: hide + clear the caller's history.
      await channel.hide(userId, true)
    }
  }

  /**
   * Open (get-or-create) the caller's persistent chat with a venue's real
   * owner — gated on a paid (or refunded) booking there. Resolves the venue
   * either directly (`venueId`) or via one of the caller's own bookings
   * (`bookingId`, which wins if both are given).
   */
  async openVenueChat(
    userId: string,
    input: { venueId?: string; bookingId?: string }
  ): Promise<{ id: string }> {
    let venueId = input.venueId

    if (input.bookingId) {
      const booking = await this.bookings
        .findOne({ bookingId: input.bookingId })
        .lean()
      if (!booking || booking.userId !== userId) {
        throw new NotFoundException("Không tìm thấy lượt đặt sân")
      }
      venueId = booking.venueId
    } else if (!venueId) {
      throw new BadRequestException("Thiếu venueId hoặc bookingId")
    }

    const venue = await this.venues.findOne({ venueId }).lean()
    if (!venue) throw new NotFoundException("Không tìm thấy sân")
    if (!venue.ownerId) {
      throw new BadRequestException("Sân này chưa hỗ trợ nhắn tin")
    }
    if (userId === venue.ownerId) {
      throw new BadRequestException("Bạn là chủ sân này")
    }

    const eligible = await this.bookings.exists({
      userId,
      venueId,
      paymentStatus: { $in: ["paid", "refunded", "partial_refund"] },
    })
    if (!eligible) {
      throw new ForbiddenException(
        "Bạn cần hoàn tất một lượt đặt sân trước khi nhắn tin với sân"
      )
    }

    // The operator's account must still exist — a venue whose owner was
    // deleted from Clerk can't read replies, so a chat would silently go
    // nowhere. (A Clerk outage throws instead of reading as "deleted".)
    const owner = await this.directory.findExisting(venue.ownerId)
    if (!owner) {
      throw new BadRequestException("Sân này hiện không nhận tin nhắn")
    }
    await this.client.upsertUsers([
      { id: userId },
      {
        id: venue.ownerId,
        name: owner.name,
        ...(owner.image ? { image: owner.image } : {}),
      },
    ])

    const brandId = venue.brandId
    if (!brandId) {
      const id = venueChannelId(venueId, userId)
      await this.client
        .channel("messaging", id, {
          name: venue.info.name,
          venueId,
          created_by_id: userId,
          members: [userId, venue.ownerId],
        })
        .create()
      return { id }
    }

    // A brand's branches all share one owner, so the player gets ONE chat per
    // brand — booking two branches must not open two threads with the same
    // person. Titled by the brand rather than whichever branch came first.
    const brand = await this.brands
      .findOne({ brandId })
      .select("info")
      .lean<{ info?: { name?: string } }>()
    const name = brand?.info?.name ?? venue.info.name
    const { id, existing } = await this.resolveBrandChannel(brandId, userId)
    const channel = this.client.channel("messaging", id, {
      name,
      venueId,
      brandId,
      created_by_id: userId,
      members: [userId, venue.ownerId],
    })
    await channel.create()
    // A reused pre-brand (per-branch) chat: tag it with the brand so the
    // operator inbox of every branch finds it, and retitle it by the brand.
    if (existing) await channel.updatePartial({ set: { brandId, name } })
    return { id }
  }

  /**
   * The channel to use for a player's chat with a brand: the brand-keyed one
   * if it exists, else the oldest per-branch chat left from before chats were
   * brand-scoped (so its history isn't stranded), else a new brand-keyed id.
   * `existing` is true only when reusing a per-branch chat that needs tagging.
   */
  private async resolveBrandChannel(
    brandId: string,
    userId: string
  ): Promise<{ id: string; existing: boolean }> {
    const brandKeyed = brandChannelId(brandId, userId)
    const branches = await this.venues
      .find({ brandId })
      .select("venueId")
      .lean<{ venueId: string }[]>()
    const legacyIds = branches.map((b) => venueChannelId(b.venueId, userId))
    if (!legacyIds.length) return { id: brandKeyed, existing: false }

    const found = await this.client.queryChannels(
      { type: "messaging", id: { $in: [brandKeyed, ...legacyIds] } },
      { created_at: 1 },
      // Server-side auth queries on the player's behalf — only channels they
      // still belong to (and haven't deleted-for-me) count as reusable.
      {
        user_id: userId,
        limit: 30,
        state: false,
        watch: false,
        presence: false,
      }
    )
    const ids = found.map((c) => c.id)
    if (ids.includes(brandKeyed)) return { id: brandKeyed, existing: false }
    const legacy = ids.find((id): id is string => Boolean(id))
    return legacy
      ? { id: legacy, existing: true }
      : { id: brandKeyed, existing: false }
  }
}
