import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { BookingsService } from "../bookings/bookings.service.js"
import { PaymentsService } from "./payments.service.js"

/**
 * Cron entry point for the Phase 5 booking sweeper (VienTD-Review decisions
 * #5/#7). All the guarded, idempotent status-transition logic lives in
 * `BookingsService.sweep` — this class is just the scheduler trigger plus the
 * one cross-feature side effect `BookingsService` deliberately doesn't own
 * (cancelling an expired hold's SePay order via `PaymentsService`, to avoid a
 * `BookingsModule` ↔ `PaymentsModule` cycle). Registered as a provider on
 * `PaymentsModule`, which already imports `BookingsModule` — see the comment
 * there.
 */
@Injectable()
export class BookingsSweeperService {
  private readonly logger = new Logger(BookingsSweeperService.name)

  constructor(
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "bookings-sweep" })
  async sweep(): Promise<void> {
    try {
      const result = await this.bookings.sweep()
      for (const bookingId of result.expiredBookingIds) {
        await this.payments.cancelOrderForBooking(bookingId).catch((err: unknown) => {
          // Best-effort: the booking is already expired regardless — a
          // failure to also cancel the gateway order just means it settles
          // itself (or stays open harmlessly, nothing was ever charged) on
          // SePay's side.
          this.logger.warn(
            `Failed to cancel SePay order for expired booking ${bookingId}: ${String(err)}`
          )
        })
      }
      if (result.expired || result.autoConfirmed || result.completed) {
        this.logger.log(
          `Booking sweep: ${result.expired} expired, ${result.autoConfirmed} auto-confirmed, ${result.completed} completed`
        )
      }
    } catch (err) {
      // A failed sweep must not crash the process — the next tick tries
      // again, and every rule is idempotent so nothing is lost by skipping a
      // beat.
      this.logger.error(
        `Booking sweep failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
