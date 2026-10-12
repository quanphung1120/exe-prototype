import assert from "node:assert/strict"
import test from "node:test"

import {
  bookingDescription,
  topUpDescription,
} from "../src/features/payments/descriptions.js"

void test("topUpDescription names the app and the order", () => {
  assert.equal(topUpDescription("TU-1"), "Shuttio nap vi - TU-1")
})

void test("bookingDescription says which court, when, and keeps the id", () => {
  assert.equal(
    bookingDescription({
      bookingId: "b-9",
      courtName: "Sân Cầu Lông Đức · Court 1",
      dateKey: "2026-10-12",
      start: "18:30",
    }),
    "Shuttio dat san San Cau Long Duc Court 1 18:30 12/10 - b-9"
  )
})

void test("bookingDescription is capped so SePay never gets an oversized memo", () => {
  const text = bookingDescription({
    bookingId: "b-9",
    courtName: "x".repeat(300),
    dateKey: "2026-10-12",
    start: "18:30",
  })
  assert.ok(text.length <= 120)
})
