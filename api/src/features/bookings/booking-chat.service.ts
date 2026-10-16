import { Inject, Injectable, Logger } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { StreamService } from "../stream/stream.service.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import type { BookingRecord } from "../../shared/index.js"
import { bookingLabel, formatVnTime } from "./booking.helpers.js"

/** The moments of a booking's life that post into its chat. */
export type BookingChatEvent =
  | "proof"
  | "approved"
  | "rejected"
  | "refunded"
  | "received"
  | "not_received"

/** The booking fields a chat message reads. */
export type BookingChatSource = Pick<
  BookingRecord,
  | "bookingId"
  | "venueId"
  | "userId"
  | "customer"
  | "courtName"
  | "start"
  | "dateKey"
  | "price"
  | "amountDue"
  | "transferMemo"
  | "paymentProofUrl"
  | "confirmDeadlineAt"
  | "rejectReason"
  | "declineReason"
  | "refund"
  | "refundProofUrl"
>

const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")}₫`

/** Who speaks, the text and an optional picture for one event. Pure. */
export function bookingChatMessage(
  b: BookingChatSource,
  event: BookingChatEvent
): { from: "player" | "owner"; text: string; imageUrl?: string } {
  const what = bookingLabel(b)
  switch (event) {
    case "proof":
      return {
        from: "player",
        text: [
          "[Hệ thống] Khách đã chuyển khoản và gửi ảnh xác nhận.",
          `Lượt đặt: ${what}`,
          `Số tiền: ${vnd(b.amountDue ?? b.price)}`,
          b.transferMemo ? `Nội dung chuyển khoản: ${b.transferMemo}` : "",
          b.confirmDeadlineAt
            ? `Chủ sân vui lòng trả lời trước ${formatVnTime(b.confirmDeadlineAt)}.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        imageUrl: b.paymentProofUrl,
      }
    case "approved":
      return {
        from: "owner",
        text: `[Hệ thống] Chủ sân đã nhận tiền và xác nhận lượt đặt ${what}.`,
      }
    case "rejected": {
      const reason = b.rejectReason ?? b.declineReason
      return {
        from: "owner",
        text: [
          `[Hệ thống] Chủ sân không xác nhận lượt đặt ${what}.`,
          reason ? `Lý do: ${reason}` : "",
          "Chủ sân sẽ chuyển khoản hoàn tiền cho khách và gửi ảnh xác nhận tại đây.",
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }
    case "refunded":
      return {
        from: "owner",
        text: `[Hệ thống] Chủ sân đã chuyển hoàn ${vnd(b.refund?.amount ?? 0)}. Khách vui lòng kiểm tra tài khoản và xác nhận đã nhận.`,
        imageUrl: b.refundProofUrl,
      }
    case "received":
      return {
        from: "player",
        text: "[Hệ thống] Khách xác nhận đã nhận lại tiền hoàn.",
      }
    case "not_received":
      return {
        from: "player",
        text: "[Hệ thống] Khách báo CHƯA nhận được tiền hoàn. Khiếu nại đã được gửi tới quản trị viên — chủ sân vui lòng kiểm tra lại giao dịch.",
      }
  }
}

/**
 * Posts a booking's milestones into its own 1-1 chat (`booking-<id>`) between
 * the player and the venue owner. Strictly best-effort: a chat outage must
 * never block an approval, rejection or refund, so every failure is logged
 * and swallowed.
 */
@Injectable()
export class BookingChatService {
  private readonly logger = new Logger(BookingChatService.name)

  constructor(
    @Inject(StreamService) private readonly stream: StreamService,
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>
  ) {}

  async post(
    booking: BookingChatSource,
    event: BookingChatEvent
  ): Promise<void> {
    try {
      if (!booking.userId) return
      const venue = await this.venueModel
        .findOne({ venueId: booking.venueId })
        .select("ownerId brandId info.name")
        .lean<{
          ownerId?: string
          brandId?: string
          info?: { name?: string }
        }>()
      if (!venue?.ownerId || venue.ownerId === booking.userId) return

      await this.stream.ensureBookingChannel({
        bookingId: booking.bookingId,
        playerId: booking.userId,
        ownerId: venue.ownerId,
        venueId: booking.venueId,
        brandId: venue.brandId,
        name: `${venue.info?.name ?? "Sân"} · ${bookingLabel(booking)}`,
      })
      const msg = bookingChatMessage(booking, event)
      await this.stream.sendBookingMessage(
        booking.bookingId,
        msg.from === "player" ? booking.userId : venue.ownerId,
        msg.text,
        msg.imageUrl
      )
      // Once the player has confirmed the refund the conversation is over.
      if (event === "received") {
        await this.stream.freezeChannelById(`booking-${booking.bookingId}`)
      }
    } catch (err) {
      this.logger.warn(
        `Booking chat ${event} failed for ${booking.bookingId}: ${String(err)}`
      )
    }
  }
}
