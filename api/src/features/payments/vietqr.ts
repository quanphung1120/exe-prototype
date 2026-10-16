import { randomInt } from "node:crypto"

import type { BankAccount } from "../../shared/index.js"

/** No I/O/0/1 — characters a person reading a memo off a screen mixes up. */
const MEMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Prefix that marks a Shuttio transfer in the venue's bank statement. */
export const MEMO_PREFIX = "SHT"

/**
 * A fresh transfer memo, e.g. `SHTK7M2QX`: ASCII only (banking apps mangle
 * accents) and short enough to type by hand. Uniqueness is the caller's job —
 * the booking collection has a unique index and the caller retries on a clash.
 */
export function generateTransferMemo(
  pick: (max: number) => number = randomInt
): string {
  let suffix = ""
  for (let i = 0; i < 6; i++)
    suffix += MEMO_ALPHABET[pick(MEMO_ALPHABET.length)]
  return `${MEMO_PREFIX}${suffix}`
}

/** VietQR Quick Link image: a QR that pre-fills bank, account, amount and memo. */
export function buildVietQrImageUrl(input: {
  account: Pick<BankAccount, "bankBin" | "accountNo" | "accountName">
  amount: number
  memo: string
}): string {
  const { account, amount, memo } = input
  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: memo,
    accountName: account.accountName,
  })
  return `https://img.vietqr.io/image/${account.bankBin}-${account.accountNo}-compact2.png?${params.toString()}`
}

/** The memo on a refund transfer: it names the booking it settles. */
export function refundMemo(transferMemo: string | undefined): string {
  return transferMemo ? `Hoan tien ${transferMemo}` : "Hoan tien dat san"
}
