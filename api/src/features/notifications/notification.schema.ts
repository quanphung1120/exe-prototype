import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "../../shared/index.js"

// A transactional notification (VienTD-Review Phase 7, decision #14) — one row
// per delivery, replacing the ad-hoc pushes into a player's `Profile.notifications`
// array that the booking-decision/auto-confirm/cancel-refund/no-show producers
// used before this feature landed. `Profile.notifications` now stays the static
// demo seed only; every dynamic notification flows through here instead.
@Schema({ timestamps: true })
export class Notification {
  // Clerk user id the notification is addressed to. Explicit `type: String`
  // (not just the TS annotation) since esbuild-based runners like tsx don't
  // emit the design:type metadata `@Prop()` needs — see the same note on
  // `session.schema.ts`.
  @Prop({ required: true, index: true, type: String })
  userId: string

  // The producer's stable dedupe key (e.g. `booking-approved-<bookingId>`) —
  // globally unique since it's already derived from a unique resource id, so a
  // retried producer call (a sweep re-run, a retried write) never double-
  // delivers: `NotificationsService#create` swallows the duplicate-key error.
  @Prop({ required: true, unique: true, type: String })
  notifId: string

  @Prop({ required: true, enum: NOTIFICATION_KINDS, type: String })
  kind: NotificationKind

  @Prop({ required: true, type: String })
  text: string

  @Prop({ type: String })
  href?: string

  @Prop({ required: true, default: false, type: Boolean })
  read: boolean
}

export type NotificationDocument = HydratedDocument<Notification>
export const NotificationSchema = SchemaFactory.createForClass(Notification)

// Newest-first per-user listing — the query `list()` runs on every
// GET /api/notifications (including each ~30s web poll).
NotificationSchema.index({ userId: 1, createdAt: -1 })
