import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import "reflect-metadata"

import type { ConfigService } from "@nestjs/config"

import { SepayClient } from "../src/features/payments/sepay.client.js"

/**
 * Unit tests for `SepayClient#verifyIpnSignature` — the hand-rolled HMAC
 * verification (per SePay's IPN docs: `X-SePay-Signature: sha256=<hex>` over
 * `${timestamp}.${rawBody}`, keyed by the merchant secret). Pure crypto, no
 * network — `SePayPgClient`'s own constructor doesn't make one either, so
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

function sign(timestamp: string, body: string): string {
  const hex = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")
  return `sha256=${hex}`
}

void test("verifyIpnSignature accepts a correctly-signed, fresh request", () => {
  const client = makeClient()
  const body = Buffer.from(JSON.stringify({ notification_type: "ORDER_PAID" }))
  const timestamp = String(Math.floor(Date.now() / 1000))

  const ok = client.verifyIpnSignature(body, {
    "x-sepay-signature": sign(timestamp, body.toString("utf8")),
    "x-sepay-timestamp": timestamp,
  })

  assert.equal(ok, true)
})

void test("verifyIpnSignature rejects a tampered body", () => {
  const client = makeClient()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign(timestamp, JSON.stringify({ notification_type: "ORDER_PAID" }))
  const tamperedBody = Buffer.from(JSON.stringify({ notification_type: "TRANSACTION_VOID" }))

  const ok = client.verifyIpnSignature(tamperedBody, {
    "x-sepay-signature": signature,
    "x-sepay-timestamp": timestamp,
  })

  assert.equal(ok, false)
})

void test("verifyIpnSignature rejects a signature keyed by the wrong secret", () => {
  const client = makeClient()
  const body = Buffer.from(JSON.stringify({ notification_type: "ORDER_PAID" }))
  const timestamp = String(Math.floor(Date.now() / 1000))
  const wrongSignature = `sha256=${createHmac("sha256", "wrong-secret").update(`${timestamp}.${body.toString("utf8")}`).digest("hex")}`

  const ok = client.verifyIpnSignature(body, {
    "x-sepay-signature": wrongSignature,
    "x-sepay-timestamp": timestamp,
  })

  assert.equal(ok, false)
})

void test("verifyIpnSignature rejects a stale timestamp (replay protection)", () => {
  const client = makeClient()
  const body = Buffer.from(JSON.stringify({ notification_type: "ORDER_PAID" }))
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60)

  const ok = client.verifyIpnSignature(body, {
    "x-sepay-signature": sign(staleTimestamp, body.toString("utf8")),
    "x-sepay-timestamp": staleTimestamp,
  })

  assert.equal(ok, false)
})

void test("verifyIpnSignature rejects missing headers", () => {
  const client = makeClient()
  const body = Buffer.from(JSON.stringify({ notification_type: "ORDER_PAID" }))

  assert.equal(client.verifyIpnSignature(body, {}), false)
  assert.equal(
    client.verifyIpnSignature(body, { "x-sepay-signature": "sha256=abc" }),
    false
  )
})

void test("verifyIpnSignature rejects a malformed scheme prefix", () => {
  const client = makeClient()
  const body = Buffer.from(JSON.stringify({ notification_type: "ORDER_PAID" }))
  const timestamp = String(Math.floor(Date.now() / 1000))

  const ok = client.verifyIpnSignature(body, {
    "x-sepay-signature": "md5=deadbeef",
    "x-sepay-timestamp": timestamp,
  })

  assert.equal(ok, false)
})
