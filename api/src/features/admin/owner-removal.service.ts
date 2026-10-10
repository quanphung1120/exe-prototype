import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectConnection } from "@nestjs/mongoose"
import type { Connection } from "mongoose"
import { StreamChat } from "stream-chat"

import { BookingsService } from "../bookings/bookings.service.js"
import {
  CLERK_CLIENT,
  type ClerkBackendClient,
} from "../stream/clerk-directory.service.js"
import { STREAM_CLIENT } from "../stream/stream.service.js"

export interface RemovedOwnerSummary {
  /** The Clerk account was deleted (a venue-only owner), not just their venues. */
  accountDeleted: boolean
  brands: number
  venues: number
  bookings: number
  payments: number
  sessions: number
}

interface VenueRow {
  venueId: string
}
interface BrandRow {
  brandId: string
}
interface SessionRow {
  sessionId: string
  userId: string
  data?: { courtId?: string; venueId?: string }
}

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size)
  )

/**
 * Admin: remove one venue owner (chủ sân) and everything their venues
 * produced — the single-owner, guarded version of
 * `scripts/remove-venue-owners.ts`.
 *
 * - The owner's brands, venues, the bookings/payments at those venues, the play
 *   sessions booked there and the related Stream chats are deleted.
 * - A venue-only owner is deleted outright (profile, own sessions,
 *   notifications, wallet, Stream user and the Clerk account); an owner who is
 *   also a player keeps the account and their player data, and their account
 *   type becomes "player".
 * - Refused while a venue still has a pending/confirmed future booking (the
 *   same rule that blocks archiving) — those players must be refunded first.
 * - Admin accounts are never removed.
 *
 * Irreversible: Clerk accounts and Stream messages cannot be restored.
 */
@Injectable()
export class OwnerRemovalService {
  private readonly logger = new Logger(OwnerRemovalService.name)

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(STREAM_CLIENT) private readonly stream: StreamChat,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkBackendClient,
    private readonly bookings: BookingsService
  ) {}

  async removeOwner(
    ownerId: string,
    adminId: string
  ): Promise<RemovedOwnerSummary> {
    if (ownerId === adminId) {
      throw new BadRequestException("Không thể xoá chính tài khoản của bạn")
    }
    const db = this.connection.db
    if (!db) throw new Error("MongoDB connection is not ready")
    const col = <T extends object = Record<string, unknown>>(name: string) =>
      db.collection<T>(name)

    const venues = await col<VenueRow>("venues")
      .find({ ownerId })
      .project<VenueRow>({ venueId: 1 })
      .toArray()
    const brands = await col<BrandRow>("brands")
      .find({ ownerId })
      .project<BrandRow>({ brandId: 1 })
      .toArray()
    if (!venues.length && !brands.length) {
      throw new NotFoundException("Tài khoản này không sở hữu sân nào")
    }
    const venueIds = venues.map((v) => v.venueId)
    const brandIds = brands.map((b) => b.brandId)

    // An owner whose Clerk account is already gone (a leftover from a deleted
    // user) is still removable — only their data is left to clean up. Any
    // other Clerk failure (outage, bad key) must not read as "gone".
    const clerkUser = await this.clerk.users.getUser(ownerId).catch((err) => {
      if ((err as { status?: number })?.status === 404) return null
      throw err
    })
    if ((clerkUser?.publicMetadata as { role?: string })?.role === "admin") {
      throw new BadRequestException("Không thể xoá tài khoản quản trị viên")
    }

    for (const venueId of venueIds) {
      if (await this.bookings.hasFutureLiveBookings(venueId)) {
        throw new ConflictException(
          "Còn lượt đặt sân đang chờ duyệt hoặc đã xác nhận trong tương lai — hãy huỷ và hoàn tiền trước khi xoá chủ sân."
        )
      }
    }

    const profile = await col<{ accountType?: string }>("profiles").findOne({
      userId: ownerId,
    })
    const assessed = await col("playerassessments").findOne({
      userId: ownerId,
    })
    const alsoPlayer =
      profile?.accountType === "player" ||
      profile?.accountType === "both" ||
      assessed !== null

    // Every play session at these venues (anyone's), plus the owner's own when
    // the account goes away.
    const courtIdPattern = venueIds.length
      ? new RegExp(`^(${venueIds.join("|")})c\\d+$`)
      : null
    const sessions = (
      await col<SessionRow>("playsessions").find({}).toArray()
    ).filter(
      (s) =>
        (!alsoPlayer && s.userId === ownerId) ||
        venueIds.includes(s.data?.venueId ?? "") ||
        (courtIdPattern?.test(s.data?.courtId ?? "") ?? false)
    )
    const sessionIds = sessions.map((s) => s.sessionId)

    // Stream chats first: if listing fails nothing has been deleted yet.
    const filters = [
      ...(venueIds.length ? [{ venueId: { $in: venueIds } }] : []),
      ...(brandIds.length ? [{ brandId: { $in: brandIds } }] : []),
      ...(sessionIds.length
        ? [{ id: { $in: sessionIds.map((id) => `room-${id}`) } }]
        : []),
    ]
    const cids = new Set<string>()
    for (const filter of filters) {
      for (let offset = 0; ; offset += 30) {
        const page = await this.stream.queryChannels(
          { type: "messaging", ...filter },
          {},
          { limit: 30, offset, state: false, watch: false, presence: false }
        )
        for (const c of page) cids.add(c.cid)
        if (page.length < 30) break
      }
    }

    const bookings = await col("bookings").deleteMany({
      venueId: { $in: venueIds },
    })
    const payments = await col("payments").deleteMany({
      venueId: { $in: venueIds },
    })
    await col("playsessions").deleteMany({ sessionId: { $in: sessionIds } })
    await col("venues").deleteMany({ venueId: { $in: venueIds } })
    await col("brands").deleteMany({ brandId: { $in: brandIds } })

    if (alsoPlayer) {
      await col("profiles").updateOne(
        { userId: ownerId },
        { $set: { accountType: "player" } }
      )
    } else {
      await col("notifications").deleteMany({ userId: ownerId })
      await col("profiles").deleteMany({ userId: ownerId })
      await col("wallets").deleteMany({ userId: ownerId })
      await col("wallettxes").deleteMany({ userId: ownerId })
    }

    // Stream hard-deletes cap one batch at 100 channels.
    for (const batch of chunk([...cids], 100)) {
      await this.stream.deleteChannels(batch, { hard_delete: true })
    }
    if (!alsoPlayer) {
      await this.stream
        .deleteUsers([ownerId], {
          user: "hard",
          messages: "hard",
          conversations: "hard",
        })
        .catch((err: unknown) =>
          this.logger.warn(`Stream user ${ownerId} not deleted: ${String(err)}`)
        )
      if (clerkUser) await this.clerk.users.deleteUser(ownerId)
    }

    this.logger.log(
      `Admin ${adminId} removed venue owner ${ownerId} (${venueIds.length} venue(s), ${alsoPlayer ? "kept as player" : "account deleted"})`
    )
    return {
      accountDeleted: !alsoPlayer,
      brands: brandIds.length,
      venues: venueIds.length,
      bookings: bookings.deletedCount,
      payments: payments.deletedCount,
      sessions: sessionIds.length,
    }
  }
}
