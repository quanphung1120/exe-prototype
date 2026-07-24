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
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { ClerkDirectoryService } from "./clerk-directory.service.js"
import {
  StreamSeedState,
  type StreamSeedStateDocument,
} from "./stream-seed.schema.js"

// stream-chat v9 treats a channel's `name` as a custom field (the base
// `CustomChannelData` is empty), so declare the display name we set on channels.
declare module "stream-chat" {
  interface CustomChannelData {
    name?: string
    /** Owning venue of a player↔venue chat (absent on all other channels). */
    venueId?: string
  }
}

/** DI token for the shared server-side StreamChat client (faked in tests). */
export const STREAM_CLIENT = Symbol("STREAM_CLIENT")

/** Stream user id for a mock demo player, keyed by their initials (TH → demo-player-th). */
export const demoPlayerStreamId = (initials: string) =>
  `demo-player-${initials.toLowerCase()}`

/** Per-user channel id for a seeded demo chat (never shared between users). */
export const demoChannelId = (chatId: string, userId: string) =>
  `demo-${chatId}-${userId}`

/** Channel id for a room's real chat — mirrors the web's `roomChannelId`. */
export const roomChannelId = (roomId: string) => `room-${roomId}`

/** Deterministic DM channel id for a user pair (order-independent). */
export const dmChannelId = (a: string, b: string) =>
  `dm-${createHash("sha256").update([a, b].sort().join(":")).digest("hex").slice(0, 40)}`

/** Deterministic per-(player, venue) chat channel id. */
export const venueChannelId = (venueId: string, userId: string) =>
  `venue-${createHash("sha256").update(`${venueId}:${userId}`).digest("hex").slice(0, 40)}`

// The three mock players whose demo channels every new user is seeded with.
// Their ids/names mirror the first entries of MATCH_SUGGESTIONS (p1/p2/p3).
const DEMO_PLAYERS = [
  { initials: "TH", name: "Trần Huy" },
  { initials: "LL", name: "Lê Lan" },
  { initials: "PQ", name: "Phạm Quân" },
] as const

// The seeded "Badminton Crew" group thread — moved verbatim from the old
// `THREAD` fixture in data/player.ts. `from: "me"` is sent as the seeded user;
// the rest as the named demo player.
const CREW_THREAD: { text: string; from: string }[] = [
  { text: "Court 3 is booked for tonight 🔥", from: demoPlayerStreamId("TH") },
  { text: "Confirmed for tonight ✅", from: demoPlayerStreamId("LL") },
  { text: "Perfect. I'll warm up the serves 😅", from: "me" },
  { text: "See you at Court 3 at 6:30 👊", from: demoPlayerStreamId("TH") },
]

// The three seeded DMs — one mock member each, one opening message (texts moved
// from the old `CHATS[].last` fixture fields).
const DEMO_DMS = [
  {
    chatId: "ch2",
    initials: "TH",
    name: "Trần Huy",
    text: "Bring an extra grip if you have one",
  },
  {
    chatId: "ch3",
    initials: "LL",
    name: "Lê Lan",
    text: "Confirmed for tonight ✅",
  },
  {
    chatId: "ch4",
    initials: "PQ",
    name: "Phạm Quân",
    text: "Rematch this weekend? 🏓",
  },
] as const

// Server-side Stream Chat integration. Signs per-user JWTs (a local operation)
// and, on a user's first token request, seeds their demo users + channels in
// Stream — gated by an atomic Mongo flag so it runs exactly once per user.
// Also lazily gets-or-creates match-room/team channels on demand.
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name)

  constructor(
    @Inject(STREAM_CLIENT) private readonly client: StreamChat,
    @InjectModel(StreamSeedState.name)
    private readonly seeds: Model<StreamSeedStateDocument>,
    @InjectModel(Venue.name) private readonly venues: Model<VenueDocument>,
    @InjectModel(Booking.name)
    private readonly bookings: Model<BookingDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  /**
   * A Stream credentials pair for the signed-in user: the app key (handed to the
   * web client) and a freshly signed user token. Seeds the user's demo data on
   * first call. `createToken` is a local JWT sign — cheap to run per request.
   */
  async issueToken(
    userId: string,
    name?: string,
    image?: string
  ): Promise<{ apiKey: string; token: string }> {
    await this.seedForUser(userId, name, image)
    // 24h bounds the life of a leaked token; the web client refreshes via its
    // token provider, so a short-lived token costs nothing in UX.
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
    return {
      apiKey: this.client.key,
      token: this.client.createToken(userId, exp),
    }
  }

  /**
   * Seed a user's demo users + channels the first time they authenticate. The
   * `$setOnInsert` upsert claims the seed atomically: only the request that
   * inserts the marker (upsertedCount === 1) does the Stream work, so concurrent
   * first-token requests can't double-seed.
   */
  private async seedForUser(
    userId: string,
    name?: string,
    image?: string
  ): Promise<void> {
    const res = await this.seeds.updateOne(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true }
    )
    if (!res.upsertedCount) return

    try {
      await this.client.upsertUsers([
        { id: userId, name: name || "You", ...(image ? { image } : {}) },
        ...DEMO_PLAYERS.map((p) => ({
          id: demoPlayerStreamId(p.initials),
          name: p.name,
        })),
      ])

      // "Badminton Crew" group — the current user plus all three mock players.
      const crew = this.client.channel(
        "messaging",
        demoChannelId("ch1", userId),
        {
          name: "Badminton Crew",
          created_by_id: demoPlayerStreamId("TH"),
          members: [
            userId,
            ...DEMO_PLAYERS.map((p) => demoPlayerStreamId(p.initials)),
          ],
        }
      )
      await crew.create()
      for (const m of CREW_THREAD) {
        await crew.sendMessage({
          text: m.text,
          user_id: m.from === "me" ? userId : m.from,
        })
      }

      // Three DMs — one mock member each, one opening message from that player.
      for (const dm of DEMO_DMS) {
        const otherId = demoPlayerStreamId(dm.initials)
        const ch = this.client.channel(
          "messaging",
          demoChannelId(dm.chatId, userId),
          {
            name: dm.name,
            created_by_id: userId,
            members: [userId, otherId],
          }
        )
        await ch.create()
        await ch.sendMessage({ text: dm.text, user_id: otherId })
      }
    } catch (err) {
      // The Mongo marker is already set, so seeding won't retry. Log loudly —
      // this is usually misconfigured/invalid Stream credentials; the web side
      // degrades to the chat "unavailable" state rather than hard-failing.
      this.logger.error(
        `Failed to seed Stream demo data for ${userId}`,
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

    const owner = await this.directory.getOne(venue.ownerId)
    await this.client.upsertUsers([
      { id: userId },
      {
        id: venue.ownerId,
        name: owner?.name ?? venue.info.name,
        ...(owner?.image ? { image: owner.image } : {}),
      },
    ])

    const id = venueChannelId(venueId, userId)
    const channel = this.client.channel("messaging", id, {
      name: venue.info.name,
      venueId,
      created_by_id: userId,
      members: [userId, venue.ownerId],
    })
    await channel.create()
    return { id }
  }
}
