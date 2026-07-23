import { describe, expect, it } from "vitest"

import { allowRequest } from "./rate-limit"

/**
 * `allowRequest(userId, now?)` is a fixed-window per-user limiter
 * (WINDOW_MS = 60_000, MAX_REQUESTS = 10) guarding the AI chat route. The
 * injectable `now` param lets these tests drive the window deterministically
 * instead of racing the real clock.
 */

describe("allowRequest", () => {
  it("allows the first MAX_REQUESTS (10) calls for a user within the window", () => {
    const userId = "user-cap"
    const now = 1_000_000
    for (let i = 0; i < 10; i++) {
      expect(allowRequest(userId, now)).toBe(true)
    }
  })

  it("rejects the 11th call in the same window", () => {
    const userId = "user-cap-11"
    const now = 1_000_000
    for (let i = 0; i < 10; i++) {
      expect(allowRequest(userId, now)).toBe(true)
    }
    expect(allowRequest(userId, now)).toBe(false)
  })

  it("keeps rejecting further calls later in the same window", () => {
    const userId = "user-cap-keeps-rejecting"
    const now = 1_000_000
    for (let i = 0; i < 10; i++) {
      expect(allowRequest(userId, now)).toBe(true)
    }
    expect(allowRequest(userId, now + 1_000)).toBe(false)
    expect(allowRequest(userId, now + 30_000)).toBe(false)
  })

  it("allows a call again once `now` has advanced past the window (60_000ms)", () => {
    const userId = "user-window-rollover"
    const now = 2_000_000
    for (let i = 0; i < 10; i++) {
      expect(allowRequest(userId, now)).toBe(true)
    }
    // still inside the window (< 60_000ms later) — rejected
    expect(allowRequest(userId, now + 59_999)).toBe(false)
    // exactly at the window boundary — a fresh window starts
    expect(allowRequest(userId, now + 60_000)).toBe(true)
    // and the fresh window has its own full quota
    for (let i = 0; i < 9; i++) {
      expect(allowRequest(userId, now + 60_000)).toBe(true)
    }
    expect(allowRequest(userId, now + 60_000)).toBe(false)
  })

  it("isolates request counts between different userIds", () => {
    const now = 3_000_000
    for (let i = 0; i < 10; i++) {
      expect(allowRequest("user-a", now)).toBe(true)
    }
    // user-a is now capped, but user-b has an independent quota
    expect(allowRequest("user-a", now)).toBe(false)
    expect(allowRequest("user-b", now)).toBe(true)
  })
})
