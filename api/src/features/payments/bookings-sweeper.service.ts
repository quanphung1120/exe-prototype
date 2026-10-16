import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { BookingsService } from "../bookings/bookings.service.js"

/**
 * Cron entry point for the booking sweeper. All the guarded, idempotent
 * status-transition logic lives in `BookingsService.sweep` — this class is just
 * the scheduler trigger: confirmed bookings complete after they end, a
 * transfer the venue never answered is rejected so the refund can start, and a
 * venue is reminded halfway through its answer window. Nothing is ever
 * confirmed on silence.
 */
@Injectable()
export class BookingsSweeperService {
  private readonly logger = new Logger(BookingsSweeperService.name)

  constructor(private readonly bookings: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "bookings-sweep" })
  async sweep(): Promise<void> {
    try {
      const result = await this.bookings.sweep()
      if (result.completed || result.overdueRejected || result.reminded) {
        this.logger.log(
          `Booking sweep: ${result.completed} completed, ${result.overdueRejected} overdue transfers rejected, ${result.reminded} venues reminded`
        )
      }
    } catch (err) {
      this.logger.error(
        `Booking sweep failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
