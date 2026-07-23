import assert from "node:assert/strict"
import { test } from "node:test"

import { allowRequest } from "../src/features/ai/chat-rate-limit.js"

/**
 * `allowRequest(userId, now?)` is a fixed-window per-user limiter
 * (WINDOW_MS = 60_000, MAX_REQUESTS = 10) guarding POST /api/ai/chat. The
 * injectable `now` param lets these tests drive the window deterministically
 * instead of racing the real clock. Each test uses a distinct `userId` — the
 * module's `Map` is shared across the whole test process.
 */

void test("allows the first MAX_REQUESTS (10) calls for a user within the window", () => {
  const userId = "user-cap"
  const now = 1_000_000
  for (let i = 0; i < 10; i++) {
    assert.equal(allowRequest(userId, now), true)
  }
})

void test("rejects the 11th call in the same window", () => {
  const userId = "user-cap-11"
  const now = 1_000_000
  for (let i = 0; i < 10; i++) {
    assert.equal(allowRequest(userId, now), true)
  }
  assert.equal(allowRequest(userId, now), false)
})

void test("keeps rejecting further calls later in the same window", () => {
  const userId = "user-cap-keeps-rejecting"
  const now = 1_000_000
  for (let i = 0; i < 10; i++) {
    assert.equal(allowRequest(userId, now), true)
  }
  assert.equal(allowRequest(userId, now + 1_000), false)
  assert.equal(allowRequest(userId, now + 30_000), false)
})

void test("allows a call again once `now` has advanced past the window (60_000ms)", () => {
  const userId = "user-window-rollover"
  const now = 2_000_000
  for (let i = 0; i < 10; i++) {
    assert.equal(allowRequest(userId, now), true)
  }
  // still inside the window (< 60_000ms later) — rejected
  assert.equal(allowRequest(userId, now + 59_999), false)
  // exactly at the window boundary — a fresh window starts
  assert.equal(allowRequest(userId, now + 60_000), true)
  // and the fresh window has its own full quota
  for (let i = 0; i < 9; i++) {
    assert.equal(allowRequest(userId, now + 60_000), true)
  }
  assert.equal(allowRequest(userId, now + 60_000), false)
})

void test("isolates request counts between different userIds", () => {
  const now = 3_000_000
  for (let i = 0; i < 10; i++) {
    assert.equal(allowRequest("user-a", now), true)
  }
  // user-a is now capped, but user-b has an independent quota
  assert.equal(allowRequest("user-a", now), false)
  assert.equal(allowRequest("user-b", now), true)
})
