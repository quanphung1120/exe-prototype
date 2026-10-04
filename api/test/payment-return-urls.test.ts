import assert from "node:assert/strict"
import { test } from "node:test"

import { paymentReturnUrls } from "../src/features/payments/return-urls.js"

/**
 * SePay redirects the player back to the web app per outcome — success to the
 * polling success page, error/cancel to the failed page with a reason — all
 * built from the one `SEPAY_RETURN_URL` base.
 */

void test("builds success / error / cancel URLs from the payment-return base", () => {
  assert.deepEqual(
    paymentReturnUrls("http://localhost:3000/vi/app/payment", "bk-1"),
    {
      successUrl: "http://localhost:3000/vi/app/payment/success/bk-1",
      errorUrl: "http://localhost:3000/vi/app/payment/failed/bk-1?reason=error",
      cancelUrl:
        "http://localhost:3000/vi/app/payment/failed/bk-1?reason=cancelled",
    }
  )
})

void test("accepts the legacy success-only base and a trailing slash", () => {
  const legacy = paymentReturnUrls(
    "http://localhost:3000/vi/app/payment/success/",
    "bk-1"
  )
  assert.equal(
    legacy.successUrl,
    "http://localhost:3000/vi/app/payment/success/bk-1"
  )
  assert.equal(
    legacy.cancelUrl,
    "http://localhost:3000/vi/app/payment/failed/bk-1?reason=cancelled"
  )
})

void test("encodes the booking id", () => {
  assert.equal(
    paymentReturnUrls("https://x.vn/vi/app/payment", "a b/c").successUrl,
    "https://x.vn/vi/app/payment/success/a%20b%2Fc"
  )
})
