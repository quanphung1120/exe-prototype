import { randomUUID } from "node:crypto"

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  vnNowIso,
  WITHDRAW_MAX_PENDING,
  type WithdrawalRow,
} from "../../shared/index.js"

import { NotificationsService } from "../notifications/notifications.service.js"
import type { WithdrawDto } from "./wallet.dto.js"
import { Withdrawal, type WithdrawalDocument } from "./withdrawal.schema.js"
import { WalletService } from "./wallet.service.js"

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}₫`

function toRow(w: Withdrawal): WithdrawalRow {
  return {
    id: w.withdrawalId,
    userId: w.userId,
    amount: w.amount,
    bankName: w.bankName,
    accountNumber: w.accountNumber,
    accountHolder: w.accountHolder,
    status: w.status,
    ...(w.ref ? { ref: w.ref } : {}),
    ...(w.adminNote ? { adminNote: w.adminNote } : {}),
    requestedAt: w.requestedAt,
    ...(w.resolvedAt ? { resolvedAt: w.resolvedAt } : {}),
  }
}

/**
 * Wallet withdrawals: the player asks, the amount is taken out of the wallet at
 * once, and an admin sends the bank transfer by hand and records it (or
 * rejects it, which puts the money back). Every ledger movement is keyed on the
 * withdrawal id, so retries never move money twice.
 */
@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name)

  constructor(
    @InjectModel(Withdrawal.name)
    private readonly model: Model<WithdrawalDocument>,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService
  ) {}

  /** `POST /api/wallet/withdrawals` — take `amount` out of the wallet for a transfer. */
  async create(userId: string, dto: WithdrawDto): Promise<WithdrawalRow> {
    const pending = await this.model.countDocuments({
      userId,
      status: "pending",
    })
    if (pending >= WITHDRAW_MAX_PENDING) {
      throw new ConflictException(
        `Bạn đang có ${WITHDRAW_MAX_PENDING} yêu cầu rút tiền chờ xử lý — vui lòng đợi hệ thống chuyển khoản`
      )
    }
    const withdrawalId = randomUUID()
    const last4 = dto.accountNumber.slice(-4)
    // 402 here (balance too low) happens before anything is recorded.
    await this.wallet.debit(userId, dto.amount, {
      txId: `withdraw-${withdrawalId}`,
      kind: "withdrawal",
      note: `Rút tiền về ${dto.bankName} ••${last4}`,
    })
    try {
      const doc = await this.model.create({
        withdrawalId,
        userId,
        amount: dto.amount,
        bankName: dto.bankName.trim(),
        accountNumber: dto.accountNumber,
        accountHolder: dto.accountHolder.trim(),
        status: "pending",
        requestedAt: vnNowIso(),
      })
      return toRow(doc)
    } catch (err) {
      // Nothing was recorded, so the money must not stay gone.
      await this.wallet.credit(userId, dto.amount, {
        txId: `withdraw-refund-${withdrawalId}`,
        kind: "refund",
        note: "Hoàn tiền: không tạo được yêu cầu rút tiền",
      })
      throw err
    }
  }

  /** `GET /api/wallet/withdrawals` — the player's recent requests. */
  async listMine(userId: string): Promise<WithdrawalRow[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<Withdrawal[]>()
    return docs.map(toRow)
  }

  /** Every request, pending ones first (oldest first), then the rest newest first — the admin worklist. */
  async listAll(): Promise<WithdrawalRow[]> {
    const docs = await this.model
      .find()
      .sort({ createdAt: 1 })
      .lean<Withdrawal[]>()
    const rows = docs.map(toRow)
    return [
      ...rows.filter((r) => r.status === "pending"),
      ...rows.filter((r) => r.status !== "pending").reverse(),
    ]
  }

  /** An admin records that the bank transfer was sent. */
  async complete(id: string, ref: string): Promise<WithdrawalRow> {
    const doc = await this.pendingOrThrow(id)
    doc.status = "completed"
    doc.ref = ref.trim()
    doc.resolvedAt = vnNowIso()
    await doc.save()
    await this.notify(
      doc.userId,
      `withdraw-done-${id}`,
      `Yêu cầu rút ${vnd(doc.amount)} đã được chuyển về ${doc.bankName} ••${doc.accountNumber.slice(-4)}.`
    )
    return toRow(doc)
  }

  /** An admin refuses the transfer; the money goes back into the wallet. */
  async reject(id: string, note: string): Promise<WithdrawalRow> {
    const doc = await this.pendingOrThrow(id)
    await this.wallet.credit(doc.userId, doc.amount, {
      txId: `withdraw-refund-${id}`,
      kind: "refund",
      note: "Hoàn tiền: yêu cầu rút tiền bị từ chối",
    })
    doc.status = "rejected"
    doc.adminNote = note.trim()
    doc.resolvedAt = vnNowIso()
    await doc.save()
    await this.notify(
      doc.userId,
      `withdraw-rejected-${id}`,
      `Yêu cầu rút ${vnd(doc.amount)} không được chấp nhận: ${note.trim()}. Số tiền đã được hoàn lại vào ví.`
    )
    return toRow(doc)
  }

  private async pendingOrThrow(id: string): Promise<WithdrawalDocument> {
    const doc = await this.model.findOne({ withdrawalId: id })
    if (!doc) throw new NotFoundException("Yêu cầu rút tiền không tồn tại")
    if (doc.status !== "pending") {
      throw new ConflictException("Yêu cầu rút tiền này đã được xử lý")
    }
    return doc
  }

  private async notify(
    userId: string,
    id: string,
    text: string
  ): Promise<void> {
    await this.notifications
      .create(userId, { id, kind: "booking", text, href: "/app/wallet" })
      .catch((err: unknown) => {
        this.logger.warn(`Withdrawal notification failed: ${String(err)}`)
      })
  }
}
