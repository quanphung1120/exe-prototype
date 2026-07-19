import { Injectable, Logger } from "@nestjs/common"

/**
 * Narrow seam onto the SePay payment gateway (`sepay-pg-node`, decision #9) —
 * today it exposes only the one call the booking sweeper needs: cancelling an
 * unpaid order at the gateway once the app has expired its hold, so it can't
 * be paid into afterward. The full checkout/IPN integration (initiating a
 * payment, verifying the signed webhook) is a separate, larger unit of work
 * tracked as its own phase in `FIX_REVIEW_VIENTD.md` — this class exists so
 * the sweeper has a stable, injectable dependency to call now and swap for
 * the real SDK client later without touching call sites.
 *
 * `SepayOrderClient` is the interface tests substitute (`FakeSepayClient`) to
 * assert the sweeper calls it, without a network round-trip.
 */
export interface SepayOrderClient {
  /** Cancel a not-yet-paid order at the gateway. Never throws. */
  cancelOrder(orderRef: string): Promise<void>
}

@Injectable()
export class SepayClient implements SepayOrderClient {
  private readonly logger = new Logger(SepayClient.name)

  /**
   * Best-effort: gateway/network failures are logged, not thrown — an expired
   * hold must still free its slot even if the upstream cancel fails (no money
   * was ever captured either way, so there is nothing to reconcile).
   */
  async cancelOrder(orderRef: string): Promise<void> {
    try {
      // TODO: wire the real `sepay-pg-node` SDK once the checkout/IPN feature
      // lands — `new SePayPgClient({...}).order.cancel(orderRef)`.
      this.logger.log(`SePay order cancel (stub, not yet wired): ${orderRef}`)
      await Promise.resolve()
    } catch (err) {
      this.logger.warn(
        `SePay order cancel failed for ${orderRef}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
