import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type {
  NotificationKind,
  NotificationRecord,
} from "../../shared/index.js"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import {
  Notification,
  type NotificationDocument,
} from "./notification.schema.js"

/**
 * What a producer needs to deliver a notification — deliberately shaped like
 * (a superset-compatible subset of) the existing `NotificationItem` the
 * booking-decision helpers already build (`decisionNotification` in
 * `bookings/booking.helpers.ts`), so every producer call site is a drop-in
 * rename from the old `ProfileService#addNotification(userId, item)` seam.
 */
export interface CreateNotificationInput {
  /** The producer's stable dedupe key — becomes `notifId`. */
  id: string
  kind: NotificationKind
  text: string
  href?: string
}

interface LeanNotification {
  notifId: string
  kind: NotificationKind
  text: string
  href?: string
  read: boolean
  createdAt: Date
}

function toRecord(doc: LeanNotification): NotificationRecord {
  return {
    id: doc.notifId,
    kind: doc.kind,
    text: doc.text,
    href: doc.href,
    read: doc.read,
    createdAt: doc.createdAt.toISOString(),
  }
}

// The transactional notification store (VienTD-Review Phase 7, decision #14):
// `GET /api/notifications`, `PUT …/:id/read`, `PUT …/read-all`. Producers are
// the booking decision/auto-confirm/cancel+refund/no-show call sites in
// `BookingsService`/`VenuesService`/`PaymentsService`; join/invite producers
// arrive in Phase 9 — they only need to call `create()` with a fresh `id`.
@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>
  ) {}

  /**
   * Deliver one notification. Idempotent on `input.id` (the producer's dedupe
   * key): a duplicate-key collision means it was already delivered — e.g. a
   * retried sweep tick or a retried write — so it's swallowed as a no-op
   * rather than surfaced, matching the seed-on-empty convention elsewhere
   * (`isDuplicateKeyError`).
   */
  async create(userId: string, input: CreateNotificationInput): Promise<void> {
    try {
      await this.notificationModel.create({
        userId,
        notifId: input.id,
        kind: input.kind,
        text: input.text,
        href: input.href,
        read: false,
      })
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
  }

  /** The signed-in user's notifications, newest first. */
  async list(userId: string): Promise<NotificationRecord[]> {
    const docs = await this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean<LeanNotification[]>()
    return docs.map(toRecord)
  }

  /**
   * Mark one notification read. A no-op (not a 404) when the id doesn't
   * belong to this user or doesn't exist — the web client also has purely
   * client-side notification ids (matchmaking events, the static seed) that
   * round-trip through the same optimistic `markRead` call, and those should
   * never surface as an error.
   */
  async markRead(userId: string, notifId: string): Promise<void> {
    await this.notificationModel.updateOne(
      { userId, notifId },
      { $set: { read: true } }
    )
  }

  /** Mark every one of the signed-in user's notifications read. */
  async markAllRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    )
  }
}
