import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"

import { VenuesService } from "./venues.service.js"

/**
 * Cron entry point for the Phase 5 booking sweeper. All the actual state
 * machine logic (the guarded, idempotent transitions) lives in
 * `VenuesService.sweepReservations` — this class is just the scheduler
 * trigger, kept thin so it stays easy to reason about and doesn't need its
 * own tests beyond "it calls the service" (covered by exercising
 * `sweepReservations` directly).
 */
@Injectable()
export class BookingsSweeperService {
  private readonly logger = new Logger(BookingsSweeperService.name)

  constructor(private readonly venues: VenuesService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "bookings-sweep" })
  async sweep(): Promise<void> {
    try {
      const result = await this.venues.sweepReservations()
      if (result.expired || result.autoConfirmed || result.completed) {
        this.logger.log(
          `Booking sweep: ${result.expired} expired, ${result.autoConfirmed} auto-confirmed, ${result.completed} completed`
        )
      }
    } catch (err) {
      // A failed sweep must not crash the process — the next tick tries again,
      // and every rule is idempotent so nothing is lost by skipping a beat.
      this.logger.error(
        `Booking sweep failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
