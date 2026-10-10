import assert from "node:assert/strict"
import { test } from "node:test"

import { approvalDeadlineIso } from "../src/shared/index.js"

const at = (hhmm: string, day = "2026-10-09") => `${day}T${hhmm}:00+07:00`

void test("paid while open: plain 30 minutes", () => {
  assert.equal(
    approvalDeadlineIso(at("10:00"), "06:00", "22:00", 30),
    at("10:30")
  )
})

void test("paid at 03:00: the clock starts when the venue opens", () => {
  assert.equal(
    approvalDeadlineIso(at("03:00"), "06:00", "22:00", 30),
    at("06:30")
  )
})

void test("paid after closing: the clock starts next morning", () => {
  assert.equal(
    approvalDeadlineIso(at("23:00"), "06:00", "22:00", 30),
    at("06:30", "2026-10-10")
  )
})

void test("paid shortly before closing: the remainder carries over", () => {
  assert.equal(
    approvalDeadlineIso(at("21:50"), "06:00", "22:00", 30),
    at("06:20", "2026-10-10")
  )
})
