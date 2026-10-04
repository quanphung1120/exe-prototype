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
 */
export function paymentReturnUrls(
  base: string,
  bookingId: string
): { successUrl: string; errorUrl: string; cancelUrl: string } {
  const root = base
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/success$/, "")
  const id = encodeURIComponent(bookingId)
  return {
    successUrl: `${root}/success/${id}`,
    errorUrl: `${root}/failed/${id}?reason=error`,
    cancelUrl: `${root}/failed/${id}?reason=cancelled`,
  }
}
