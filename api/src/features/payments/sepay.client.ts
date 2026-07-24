import { createHash, timingSafeEqual } from "node:crypto"

import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { SePayPgClient } from "sepay-pg-node"

// The DI token `PaymentsService` depends on instead of `sepay-pg-node`
// directly. Tests provide a fake bound to this token (see
// test/payments-service.test.ts) so nothing in this feature ever makes a
// real network call in CI — the real implementation (`SepayClient` below) is
// wired to it only in `payments.module.ts`.
export const SEPAY_CLIENT = Symbol("SEPAY_CLIENT")

export interface SepayCheckoutInput {
  /** Unique per booking — also the Payment doc's idempotency key. */
  invoiceNumber: string
  amountVnd: number
  description: string
  successUrl: string
}

export interface SepayCheckoutResult {
  /** Hidden form fields the web app POSTs to `checkoutUrl` — already HMAC-signed by the SDK. */
  fields: Record<string, string | number | undefined>
  checkoutUrl: string
}

/** The subset of a SePay order the IPN handler reads (see developer.sepay.vn IPN docs). */
export interface SepayIpnOrder {
  order_invoice_number?: string
  order_status?: string
  order_amount?: number
}

/** The IPN request body (`POST /api/payments/ipn`) — SePay's four top-level sections. */
export interface SepayIpnPayload {
  timestamp?: number
  notification_type?: string
  order?: SepayIpnOrder
  transaction?: Record<string, unknown>
  customer?: Record<string, unknown>
}

/** Case-insensitive header lookup, tolerant of Express's array-valued repeats. */
export type SepayIpnHeaders = Record<string, string | string[] | undefined>

/**
 * The seam `PaymentsService` depends on instead of `sepay-pg-node` directly —
 * an injectable interface so tests bind a fake to `SEPAY_CLIENT` and never
 * touch the network. `SepayClient` (below) is the only real implementation.
 */
export interface SepayClientPort {
  /** `client.checkout.initOneTimePaymentFields()` + `initCheckoutUrl()` — 100% of the booking price (decision #3). */
  initCheckout(input: SepayCheckoutInput): SepayCheckoutResult
  /** `client.order.retrieve()` — reconciliation for `GET /api/payments/by-booking/:id`. */
  retrieveOrder(invoiceNumber: string): Promise<unknown>
  /** `client.order.cancel()` — cancels a not-yet-paid QR order. The Phase 5 sweeper's hold-expiry seam. */
  cancelOrder(invoiceNumber: string): Promise<void>
  /**
   * Verify an inbound IPN request's authenticity. SePay does NOT HMAC-sign
   * IPN requests — per developer.sepay.vn/en/cong-thanh-toan/IPN, the merchant
   * configures the IPN with auth type = SECRET_KEY and SePay then sends that
   * secret verbatim in an `X-Secret-Key` header, which we compare (timing-safe)
   * against `SEPAY_SECRET_KEY`. The dashboard's IPN secret must therefore be
   * set to the same value as the env var. `sepay-pg-node` only signs
   * *outbound* checkout fields, so this is hand-rolled.
   */
  verifyIpnAuth(headers: SepayIpnHeaders): boolean
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

@Injectable()
export class SepayClient implements SepayClientPort {
  private readonly logger = new Logger(SepayClient.name)
  private readonly client: SePayPgClient
  private readonly secretKey: string

  constructor(config: ConfigService) {
    const env = config.getOrThrow<"sandbox" | "production">("SEPAY_ENV")
    const merchant_id = config.getOrThrow<string>("SEPAY_MERCHANT_ID")
    this.secretKey = config.getOrThrow<string>("SEPAY_SECRET_KEY")
    this.client = new SePayPgClient({
      env,
      merchant_id,
      secret_key: this.secretKey,
    })
  }

  initCheckout(input: SepayCheckoutInput): SepayCheckoutResult {
    const fields = this.client.checkout.initOneTimePaymentFields({
      operation: "PURCHASE",
      order_invoice_number: input.invoiceNumber,
      order_amount: input.amountVnd,
      currency: "VND",
      order_description: input.description,
      success_url: input.successUrl,
    })
    return {
      fields,
      checkoutUrl: this.client.checkout.initCheckoutUrl(),
    }
  }

  async retrieveOrder(invoiceNumber: string): Promise<unknown> {
    const res = await this.client.order.retrieve(invoiceNumber)
    return res.data
  }

  async cancelOrder(invoiceNumber: string): Promise<void> {
    try {
      await this.client.order.cancel(invoiceNumber)
    } catch (err) {
      // Best-effort: an order that's already paid/expired/cancelled on
      // SePay's side (e.g. this is a retry) throws here too — the caller
      // (PaymentsService) only needs "the order is no longer open", which
      // failing this call already implies as much as succeeding does.
      this.logger.warn(
        `SePay order.cancel(${invoiceNumber}) failed — treating as already-closed: ${String(err)}`
      )
    }
  }

  verifyIpnAuth(headers: SepayIpnHeaders): boolean {
    const provided = headerValue(headers["x-secret-key"])
    if (!provided) return false

    // Hash both sides so timingSafeEqual gets equal-length inputs regardless
    // of the provided value's length.
    const expected = createHash("sha256").update(this.secretKey).digest()
    const actual = createHash("sha256").update(provided).digest()
    return timingSafeEqual(expected, actual)
  }
}
