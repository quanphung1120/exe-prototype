"use server"

import { apiFetch } from "@/lib/api"

// Server actions for the SePay payment gateway (Phase 4, VienTD-Review
// decision #3/#9) — thin wrappers over `POST /api/payments/checkout` and
// `GET /api/payments/by-booking/:id`. Mirrors `booking-actions.ts`'s shape
// (a result object instead of a thrown error — see the note there for why)
// so `session.tsx`/`payment-return.tsx` can branch on failure the same way.

export type PaymentRecordStatus = "awaiting" | "paid" | "cancelled"

/** The shape `POST /api/payments/checkout` and `GET /api/payments/by-booking/:id` return. */
export interface PaymentSummary {
  bookingId: string
  invoiceNumber: string
  amount: number
  currency: string
  status: PaymentRecordStatus
  checkoutUrl?: string
  paidAt?: string
}

/** `POST /api/payments/checkout` response — the summary plus the signed SePay form. */
export interface CheckoutResult {
  payment: PaymentSummary
  /** Hidden form fields to POST to `checkoutUrl` — already HMAC-signed by SePay's SDK. */
  fields: Record<string, string | number | undefined>
  checkoutUrl: string
}

export type PaymentActionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

// Same unwrap as `booking-actions.ts#bookingsApi` — see the note there on why
// a plain result object crosses the Server Action boundary instead of a throw.
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

/**
 * Start (or resume) a SePay checkout for the caller's own `awaiting_payment`
 * booking hold. Re-calling for the same booking before it's paid is
 * idempotent server-side (reuses the same `Payment`/invoice) — `book.tsx`'s
 * pay button relies on that to let a failed checkout be retried.
 */
export async function startPaymentCheckout(
  bookingId: string
): Promise<PaymentActionResult<CheckoutResult>> {
  return paymentsApi<CheckoutResult>("/api/payments/checkout", {
    method: "POST",
    body: { bookingId },
  })
}

/**
 * Poll the caller's payment status — used by the SePay return screen
 * (`payment-return.tsx`) while waiting for the IPN (or this endpoint's own
 * `order.retrieve()` reconciliation) to confirm the money moved.
 */
export async function getPaymentStatus(
  bookingId: string
): Promise<PaymentActionResult<PaymentSummary>> {
  return paymentsApi<PaymentSummary>(
    `/api/payments/by-booking/${encodeURIComponent(bookingId)}`
  )
}
