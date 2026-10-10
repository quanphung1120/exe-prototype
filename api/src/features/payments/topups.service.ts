import { randomUUID } from "node:crypto"

import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { vnNowIso, type TopUpSummary } from "../../shared/index.js"

import { NotificationsService } from "../notifications/notifications.service.js"
import { WalletService } from "../wallet/wallet.service.js"
import { topUpReturnUrls } from "./return-urls.js"
import { SEPAY_CLIENT, type SepayClientPort } from "./sepay.client.js"
import {
  TOPUP_INVOICE_PREFIX,
  TopUp,
  type TopUpDocument,
} from "./topup.schema.js"

/** `POST /api/wallet/topups` response — the summary plus the signed form to submit. */
export interface TopUpCheckoutResult {
  topUp: TopUpSummary
  fields: Record<string, string | number | undefined>
  checkoutUrl: string
}

// Same set `PaymentsService` treats as "SePay says this order is paid".
const PAID_REMOTE_STATUSES = new Set(["CAPTURED", "PAID", "COMPLETED"])

function toSummary(doc: TopUp): TopUpSummary {
  return {
    id: doc.invoiceNumber,
    amount: doc.amount,
    status: doc.status,
    ...(doc.paidAt ? { paidAt: doc.paidAt } : {}),
  }
}

/**
 * Wallet top-ups over SePay. Mirrors `PaymentsService`'s booking checkout —
 * one `TopUp` doc per SePay order, settled idempotently by the IPN (or the
 * poll's `order.retrieve()` fallback) — but the money lands in the player's
 * wallet instead of confirming a booking.
 */
@Injectable()
export class TopUpsService {
  private readonly logger = new Logger(TopUpsService.name)
  private readonly returnUrl: string

  constructor(
    @InjectModel(TopUp.name) private readonly topUpModel: Model<TopUpDocument>,
    @Inject(SEPAY_CLIENT) private readonly sepay: SepayClientPort,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ConfigService) config: ConfigService
  ) {
    this.returnUrl = config.getOrThrow<string>("SEPAY_RETURN_URL")
  }

  /** `POST /api/wallet/topups` — open a SePay checkout for `amount` VND. */
  async create(userId: string, amount: number): Promise<TopUpCheckoutResult> {
    const invoiceNumber = `${TOPUP_INVOICE_PREFIX}${randomUUID()}`
    const topUp = await this.topUpModel.create({
      invoiceNumber,
      userId,
      amount,
      status: "awaiting",
    })
    const { fields, checkoutUrl } = this.sepay.initCheckout({
      invoiceNumber,
      amountVnd: amount,
      description: `Nap vi SportMatch - ${invoiceNumber}`,
      ...topUpReturnUrls(this.returnUrl, invoiceNumber),
    })
    return { topUp: toSummary(topUp), fields, checkoutUrl }
  }

  /**
   * `GET /api/wallet/topups/:id` — polled on return from SePay. While still
   * `awaiting` it reconciles against `order.retrieve()` (an IPN that hasn't
   * landed yet must not strand the player); a `paid` order re-runs the
   * (idempotent) credit so an interrupted settle self-heals.
   */
  async byId(userId: string, invoiceNumber: string): Promise<TopUpSummary> {
    const topUp = await this.topUpModel.findOne({ invoiceNumber })
    if (!topUp) throw new NotFoundException("Top-up not found")
    if (topUp.userId !== userId) {
      throw new ForbiddenException("This top-up belongs to another account")
    }
    if (topUp.status === "paid") {
      await this.credit(topUp)
      return toSummary(topUp)
    }
    if (topUp.status !== "awaiting") return toSummary(topUp)

    try {
      const remote = (await this.sepay.retrieveOrder(invoiceNumber)) as
        { order_status?: string } | undefined
      const status = remote?.order_status?.trim().toUpperCase()
      if (status && PAID_REMOTE_STATUSES.has(status)) {
        const paid = await this.settle(invoiceNumber, remote)
        if (paid) return toSummary(paid)
      }
    } catch (err) {
      this.logger.warn(
        `SePay order.retrieve(${invoiceNumber}) failed — deferring to the IPN/next poll: ${String(err)}`
      )
    }
    return toSummary(topUp)
  }

  /**
   * Flip an `awaiting` top-up to `paid` (guarded on the amount when the caller
   * has one, so a short-settled order credits nothing) and credit the wallet.
   * Returns `null` on a replay / unknown invoice / amount mismatch.
   */
  async settle(
    invoiceNumber: string,
    rawPayload: unknown,
    expectedAmount?: number | string
  ): Promise<TopUpDocument | null> {
    let amount: number | undefined
    if (expectedAmount !== undefined) {
      amount = Number(String(expectedAmount).trim())
      if (!Number.isFinite(amount)) {
        this.logger.error(
          `IPN for top-up ${invoiceNumber}: non-numeric order_amount ${JSON.stringify(expectedAmount)} — not credited`
        )
        return null
      }
    }
    const updated = await this.topUpModel.findOneAndUpdate(
      {
        invoiceNumber,
        status: "awaiting",
        ...(amount !== undefined ? { amount } : {}),
      },
      { $set: { status: "paid", paidAt: vnNowIso(), ipnPayload: rawPayload } },
      { new: true }
    )
    if (!updated) return null
    await this.credit(updated)
    return updated
  }

  /** Credit the wallet for a paid top-up — idempotent on `topup-<invoice>`. */
  private async credit(topUp: TopUpDocument): Promise<void> {
    const { applied } = await this.wallet.credit(topUp.userId, topUp.amount, {
      txId: `topup-${topUp.invoiceNumber}`,
      kind: "topup",
      note: "Nạp tiền vào ví qua SePay",
    })
    if (!applied) return
    await this.notifications
      .create(topUp.userId, {
        id: `topup-paid-${topUp.invoiceNumber}`,
        kind: "booking",
        text: `Nạp ví thành công +${topUp.amount.toLocaleString("vi-VN")}đ.`,
        href: "/app/wallet",
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Failed to notify ${topUp.userId} of top-up ${topUp.invoiceNumber}: ${String(err)}`
        )
      })
  }
}
