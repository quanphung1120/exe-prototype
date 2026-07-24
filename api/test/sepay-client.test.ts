import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import type { ConfigService } from "@nestjs/config"

import { SepayClient } from "../src/features/payments/sepay.client.js"

/**
 * Unit tests for `SepayClient#verifyIpnAuth` — SePay authenticates IPN
 * requests by sending the merchant-configured secret verbatim in an
 * `X-Secret-Key` header (auth type = SECRET_KEY), which we compare
 * timing-safely against `SEPAY_SECRET_KEY`. Pure crypto, no network —
 * `SePayPgClient`'s own constructor doesn't make one either, so
 * instantiating the real `SepayClient` here (unlike `PaymentsService`'s
 * tests, which always fake `SEPAY_CLIENT`) is still safe in CI.
 */

const SECRET = "test-secret-key"

const config = {
  getOrThrow: (key: string) => {
    if (key === "SEPAY_ENV") return "sandbox"
    if (key === "SEPAY_MERCHANT_ID") return "merchant-1"
    if (key === "SEPAY_SECRET_KEY") return SECRET
    throw new Error(`unexpected config key: ${key}`)
  },
} as unknown as ConfigService

function makeClient() {
  return new SepayClient(config)
}

void test("verifyIpnAuth accepts the configured secret key", () => {
  const client = makeClient()
  assert.equal(client.verifyIpnAuth({ "x-secret-key": SECRET }), true)
})

void test("verifyIpnAuth accepts an array-valued header (first value wins)", () => {
  const client = makeClient()
  assert.equal(client.verifyIpnAuth({ "x-secret-key": [SECRET] }), true)
})

void test("verifyIpnAuth rejects a wrong secret key", () => {
  const client = makeClient()
  assert.equal(client.verifyIpnAuth({ "x-secret-key": "wrong-secret" }), false)
})

void test("verifyIpnAuth rejects a secret of a different length", () => {
  const client = makeClient()
  assert.equal(client.verifyIpnAuth({ "x-secret-key": `${SECRET}x` }), false)
})

void test("verifyIpnAuth rejects a missing or empty header", () => {
  const client = makeClient()
  assert.equal(client.verifyIpnAuth({}), false)
  assert.equal(client.verifyIpnAuth({ "x-secret-key": "" }), false)
  assert.equal(client.verifyIpnAuth({ "x-secret-key": undefined }), false)
})
