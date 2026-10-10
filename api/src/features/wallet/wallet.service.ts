import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectConnection, InjectModel } from "@nestjs/mongoose"
import type { Connection, Model } from "mongoose"

import {
  vnNowIso,
  type WalletSummary,
  type WalletTransaction,
  type WalletTxKind,
} from "../../shared/index.js"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import {
  Wallet,
  WalletTx,
  type WalletDocument,
  type WalletTxDocument,
} from "./wallet.schema.js"

/** How many ledger lines `GET /api/wallet` returns. */
const HISTORY_LIMIT = 50

/** What a wallet movement needs besides who and how much. */
export interface WalletMovement {
  /** Idempotency key — a repeat with the same id moves no money. */
  txId: string
  kind: WalletTxKind
  note: string
  bookingId?: string
}

function toTransaction(doc: WalletTx & { _id: unknown }): WalletTransaction {
  return {
    id: doc.txId,
    kind: doc.kind,
    amount: doc.amount,
    balanceAfter: doc.balanceAfter,
    note: doc.note,
    ...(doc.bookingId ? { bookingId: doc.bookingId } : {}),
    at: doc.at,
  }
}

/**
 * A player's wallet (ví): one balance plus an append-only ledger. Every
 * movement is a single Mongo transaction (balance `$inc` + ledger row), and the
 * ledger's unique `txId` makes each one idempotent — a replayed SePay IPN or a
 * retried refund can never credit or debit twice.
 */
@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
    @InjectModel(WalletTx.name)
    private readonly txModel: Model<WalletTxDocument>,
    @InjectConnection() private readonly connection: Connection
  ) {}

  /** `GET /api/wallet` — balance plus the most recent ledger lines. */
  async getSummary(userId: string): Promise<WalletSummary> {
    const [wallet, txs] = await Promise.all([
      this.walletModel.findOne({ userId }).lean<{ balance: number }>(),
      this.txModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .lean<(WalletTx & { _id: unknown })[]>(),
    ])
    return {
      balance: wallet?.balance ?? 0,
      transactions: txs.map(toTransaction),
    }
  }

  /** Current balance (0 for a player who never touched the wallet). */
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.walletModel
      .findOne({ userId })
      .lean<{ balance: number }>()
    return wallet?.balance ?? 0
  }

  /**
   * Add `amount` VND. Returns `applied: false` (and the current balance) when
   * `movement.txId` was already recorded — the call is a safe no-op replay.
   */
  async credit(
    userId: string,
    amount: number,
    movement: WalletMovement
  ): Promise<{ balance: number; applied: boolean }> {
    return this.move(userId, Math.abs(amount), movement)
  }

  /**
   * Take `amount` VND. Throws 402 when the balance is short; returns
   * `applied: false` when `movement.txId` was already recorded.
   */
  async debit(
    userId: string,
    amount: number,
    movement: WalletMovement
  ): Promise<{ balance: number; applied: boolean }> {
    return this.move(userId, -Math.abs(amount), movement)
  }

  private async move(
    userId: string,
    signed: number,
    movement: WalletMovement
  ): Promise<{ balance: number; applied: boolean }> {
    try {
      const balance = await this.connection.transaction(async (session) => {
        const wallet = await this.walletModel.findOneAndUpdate(
          // A debit only matches while the balance covers it.
          signed < 0 ? { userId, balance: { $gte: -signed } } : { userId },
          { $inc: { balance: signed } },
          { new: true, upsert: signed > 0, session }
        )
        if (!wallet) {
          throw new HttpException(
            "Số dư ví không đủ — vui lòng nạp thêm tiền",
            HttpStatus.PAYMENT_REQUIRED
          )
        }
        await this.txModel.create(
          [
            {
              txId: movement.txId,
              userId,
              kind: movement.kind,
              amount: signed,
              balanceAfter: wallet.balance,
              note: movement.note,
              bookingId: movement.bookingId,
              at: vnNowIso(),
            },
          ],
          { session }
        )
        return wallet.balance
      })
      return { balance, applied: true }
    } catch (err) {
      // The ledger row already exists: the whole transaction rolled back, so
      // the balance is untouched and the earlier call stands.
      if (isDuplicateKeyError(err) && (await this.hasTx(movement.txId))) {
        return { balance: await this.getBalance(userId), applied: false }
      }
      throw err
    }
  }

  private async hasTx(txId: string): Promise<boolean> {
    return (await this.txModel.exists({ txId })) != null
  }
}
