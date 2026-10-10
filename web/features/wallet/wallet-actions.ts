"use server"

import { apiFetch } from "@/lib/api"
import type { TopUpSummary, WalletSummary, WithdrawalRow } from "@/lib/shared"

// Server actions for the player's wallet (ví) — thin wrappers over
// `GET /api/wallet` and `/api/wallet/topups`. Same result-object shape as
// `payment-actions.ts` (a plain object crosses the Server Action boundary
// where a thrown error would be redacted).

export type WalletActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

/** `POST /api/wallet/topups` response — the order plus the signed SePay form. */
export interface TopUpCheckout {
  topUp: TopUpSummary
  fields: Record<string, string | number | undefined>
  checkoutUrl: string
}

async function walletApi<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<WalletActionResult<T>> {
  try {
    const data = await apiFetch<T>(path, init)
    return { ok: true, data }
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number(err.status)
        : 500
    const message =
      err && typeof err === "object" && "error" in err
        ? ((err as { error?: { error?: string } }).error?.error ?? undefined)
        : undefined
    return { ok: false, status, message: message ?? "Request failed" }
  }
}

/** Balance and recent ledger lines. */
export async function getWallet(): Promise<WalletActionResult<WalletSummary>> {
  return walletApi<WalletSummary>("/api/wallet")
}

/** Open a SePay checkout that adds `amount` VND to the wallet when paid. */
export async function createTopUp(
  amount: number
): Promise<WalletActionResult<TopUpCheckout>> {
  return walletApi<TopUpCheckout>("/api/wallet/topups", {
    method: "POST",
    body: { amount },
  })
}

/** Poll a top-up order on return from SePay. */
export async function getTopUp(
  id: string
): Promise<WalletActionResult<TopUpSummary>> {
  return walletApi<TopUpSummary>(`/api/wallet/topups/${encodeURIComponent(id)}`)
}

/** Take money out of the wallet; an admin sends the bank transfer by hand. */
export async function createWithdrawal(input: {
  amount: number
  bankName: string
  accountNumber: string
  accountHolder: string
}): Promise<WalletActionResult<WithdrawalRow>> {
  return walletApi<WithdrawalRow>("/api/wallet/withdrawals", {
    method: "POST",
    body: input,
  })
}
