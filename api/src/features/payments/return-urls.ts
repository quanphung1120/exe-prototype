/**
 * Where SePay sends the player back after checkout, per outcome. Built from
 * `SEPAY_RETURN_URL` — the web app's payment-return base, e.g.
 * `http://localhost:3000/vi/app/payment` — with the booking id appended:
 *
 * - paid      → `<base>/success/<bookingId>` (polls until the IPN confirms)
 * - error     → `<base>/failed/<bookingId>?reason=error`
 * - cancelled → `<base>/failed/<bookingId>?reason=cancelled`
 *
 * For backward compatibility a base that still ends in `/success` (the old
 * success-only contract) is accepted and trimmed, as is a trailing slash.
 * A base still on the pre-rename `/dashboard/payment` route is rewritten to
 * `/app/payment` — the web app no longer serves `/dashboard`.
 */
export function paymentReturnUrls(
  base: string,
  bookingId: string
): { successUrl: string; errorUrl: string; cancelUrl: string } {
  const root = base
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/success$/, "")
    .replace(/\/dashboard\/payment$/, "/app/payment")
  const id = encodeURIComponent(bookingId)
  return {
    successUrl: `${root}/success/${id}`,
    errorUrl: `${root}/failed/${id}?reason=error`,
    cancelUrl: `${root}/failed/${id}?reason=cancelled`,
  }
}

/**
 * Where SePay sends the player back after a wallet top-up: the wallet page,
 * which reads `?topup=<invoice>` (and `&status=failed|cancelled`) and polls
 * the order. Derived from the same `SEPAY_RETURN_URL` base as
 * {@link paymentReturnUrls} — `…/app/payment` becomes `…/app/wallet`.
 */
export function topUpReturnUrls(
  base: string,
  invoiceNumber: string
): { successUrl: string; errorUrl: string; cancelUrl: string } {
  const root = base
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/success$/, "")
    .replace(/\/dashboard\/payment$/, "/app/payment")
    .replace(/\/payment$/, "/wallet")
  const id = encodeURIComponent(invoiceNumber)
  return {
    successUrl: `${root}?topup=${id}`,
    errorUrl: `${root}?topup=${id}&status=failed`,
    cancelUrl: `${root}?topup=${id}&status=cancelled`,
  }
}
