import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"
import type { StreamChat } from "stream-chat"

import {
  StreamSeedState,
  type StreamSeedStateDocument,
} from "./stream-seed.schema.js"

// stream-chat v9 treats a channel's `name` as a custom field (the base
// `CustomChannelData` is empty), so declare the display name we set on channels.
declare module "stream-chat" {
  interface CustomChannelData {
    name?: string
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
    private readonly seeds: Model<StreamSeedStateDocument>
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
    return { apiKey: this.client.key, token: this.client.createToken(userId) }
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
}
