"use server"

import type { BankAccount } from "@/lib/shared"

import { apiFetch } from "@/lib/api"
import type { BookingSummary } from "@/features/play/booking-actions"

// Server actions for paying a booking by bank transfer (VietQR, plan 025): the
// player transfers straight to the venue's account, uploads a screenshot, and
// the venue checks its own bank app. They return a result object instead of
// throwing — a thrown Error crossing the Server Action boundary loses its
// message in production, and callers branch on the HTTP status (409, 402…).

export type PaymentActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

async function paymentsApi<T>(
  path: string,
  init?: Parameters<typeof apiFetch>[1]
): Promise<PaymentActionResult<T>> {
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

/** What the payment screen shows: where to transfer, how much, and the memo. */
export interface VietQrPayment {
  bookingId: string
  venueId: string
  courtName: string
  startAt: string
  dateKey: string
  start: string
  durationMin: number
  /** VND to transfer — the price minus any discount code. */
  amount: number
  originalAmount: number
  discountCode?: string
  discountAmount?: number
  /** The memo the player must put in the transfer. */
  transferMemo: string
  /** A VietQR image that pre-fills bank, account, amount and memo. */
  qrUrl: string
  /** The venue's account. */
  account: BankAccount
  /** The player's saved refund account, to pre-fill the form. */
  refundAccount: BankAccount | null
}

/** Signed params for one direct browser → Cloudinary upload. */
export interface ProofUploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

/** A bank account typed into a form (the bank is identified by its bin). */
export interface BankAccountInput {
  bankBin: string
  accountNo: string
  accountName: string
}

/** `POST /api/discounts/validate` response on success. */
export interface DiscountValidation {
  valid: true
  code: string
  type: "percent" | "fixed"
  value: number
  /** Vietnamese, server-authored — shown to the player as-is. */
  description: string
  discountAmount: number
  finalAmount: number
}

const bookingPath = (bookingId: string) =>
  `/api/bookings/${encodeURIComponent(bookingId)}`

/**
 * Start (or resume) paying for the caller's own unpaid booking. The first call
 * fixes the amount (after any discount code), the memo and the venue account;
 * calling again returns the same thing.
 */
export async function startVietQrPayment(
  bookingId: string,
  discountCode?: string
): Promise<PaymentActionResult<VietQrPayment>> {
  return paymentsApi<VietQrPayment>(`${bookingPath(bookingId)}/payment/start`, {
    method: "POST",
    body: discountCode ? { discountCode } : {},
  })
}

/** A signature to upload the transfer screenshot straight to Cloudinary. */
export async function signPaymentProofUpload(
  bookingId: string
): Promise<PaymentActionResult<ProofUploadSignature>> {
  return paymentsApi<ProofUploadSignature>(
    `${bookingPath(bookingId)}/payment/proof/signature`,
    { method: "POST" }
  )
}

/** Send the screenshot and the refund account; the booking now waits for the venue. */
export async function submitPaymentProof(
  bookingId: string,
  input: { proofUrl: string; refundAccount: BankAccountInput }
): Promise<PaymentActionResult<BookingSummary>> {
  return paymentsApi<BookingSummary>(
    `${bookingPath(bookingId)}/payment/submit`,
    {
      method: "POST",
      body: input,
    }
  )
}

/** The venue's side: a signature to upload the refund screenshot. */
export async function signRefundProofUpload(
  bookingId: string
): Promise<PaymentActionResult<ProofUploadSignature>> {
  return paymentsApi<ProofUploadSignature>(
    `${bookingPath(bookingId)}/refund/signature`,
    { method: "POST" }
  )
}

/** The venue's side: mark the refund done with its screenshot (and amount, if less than full). */
export async function completeRefund(
  bookingId: string,
  input: { proofUrl: string; amount?: number }
): Promise<PaymentActionResult<BookingSummary>> {
  return paymentsApi<BookingSummary>(
    `${bookingPath(bookingId)}/refund/complete`,
    {
      method: "POST",
      body: input,
    }
  )
}

/** The player says whether the refund arrived ("not received" opens a complaint). */
export async function confirmRefundReceipt(
  bookingId: string,
  result: "received" | "not_received"
): Promise<PaymentActionResult<BookingSummary>> {
  return paymentsApi<BookingSummary>(
    `${bookingPath(bookingId)}/refund/confirm`,
    {
      method: "POST",
      body: { result },
    }
  )
}

/**
 * Validate a discount code (mã giảm giá) against the current order amount —
 * called from the pay step as the player types a code. Failure carries the
 * server's Vietnamese message (e.g. "Mã giảm giá đã hết hạn") for inline display.
 */
export async function validateDiscountCode(
  code: string,
  amount: number
): Promise<PaymentActionResult<DiscountValidation>> {
  return paymentsApi<DiscountValidation>("/api/discounts/validate", {
    method: "POST",
    body: { code, amount },
  })
}
