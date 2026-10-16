import assert from "node:assert/strict"
import test from "node:test"

import {
  buildVietQrImageUrl,
  generateTransferMemo,
  refundMemo,
} from "../src/features/payments/vietqr.js"
import { isProofUrl } from "../src/features/payments/proof-upload.service.js"

void test("a transfer memo is SHT plus 6 unambiguous ASCII characters", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generateTransferMemo(), /^SHT[A-HJ-NP-Z2-9]{6}$/)
  }
})

void test("memos differ between calls", () => {
  const memos = new Set(
    Array.from({ length: 100 }, () => generateTransferMemo())
  )
  assert.ok(memos.size > 95)
})

void test("the QR URL pre-fills bank, account, amount, memo and holder name", () => {
  const url = new URL(
    buildVietQrImageUrl({
      account: {
        bankBin: "970422",
        accountNo: "0123456789",
        accountName: "NGUYEN VAN A",
      },
      amount: 180_000,
      memo: "SHTABC234",
    })
  )
  assert.equal(url.origin, "https://img.vietqr.io")
  assert.equal(url.pathname, "/image/970422-0123456789-compact2.png")
  assert.equal(url.searchParams.get("amount"), "180000")
  assert.equal(url.searchParams.get("addInfo"), "SHTABC234")
  assert.equal(url.searchParams.get("accountName"), "NGUYEN VAN A")
})

void test("the QR amount is a whole number of dong", () => {
  const url = buildVietQrImageUrl({
    account: { bankBin: "970422", accountNo: "0123456789", accountName: "A B" },
    amount: 99_999.6,
    memo: "SHTABC234",
  })
  assert.equal(new URL(url).searchParams.get("amount"), "100000")
})

void test("a refund memo names the booking it settles", () => {
  assert.equal(refundMemo("SHTABC234"), "Hoan tien SHTABC234")
  assert.equal(refundMemo(undefined), "Hoan tien dat san")
})

void test("isProofUrl only accepts this venue's HTTPS Cloudinary proofs", () => {
  const good =
    "https://res.cloudinary.com/demo/image/upload/v1/shuttio/payment-proofs/v9/a.png"
  assert.equal(isProofUrl(good, "demo", "v9"), true)
  assert.equal(isProofUrl(good, "demo", "v8"), false)
  assert.equal(isProofUrl(good, "other-cloud", "v9"), false)
  assert.equal(isProofUrl(good.replace("https", "http"), "demo", "v9"), false)
  assert.equal(isProofUrl(`${good}?a=1`, "demo", "v9"), false)
  assert.equal(isProofUrl("not a url", "demo", "v9"), false)
})
