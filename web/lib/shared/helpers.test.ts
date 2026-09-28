import { describe, expect, it } from "vitest"

import {
  addDaysIso,
  dayLabelFor,
  formatVnd,
  formatVndFull,
  hashStr,
  isoDateOf,
  rangesOverlap,
  courtNumberFor,
  venueCourtToCourt,
  sessionToBooking,
  type PlaySession,
  type Court,
  type Venue,
  type VenueCourt,
} from "@/lib/shared"

describe("booking court identity", () => {
  const courts = [
    { id: "a", name: "Club · Court 7", courtName: "Court 7" },
    { id: "b", name: "Club · VIP 2", courtName: "VIP 2" },
  ] as Court[]

  it("uses the actual court name independently of catalog position", () => {
    expect(courtNumberFor(courts, "a")).toBe("Court 7")
    expect(courtNumberFor([...courts].reverse(), "a")).toBe("Court 7")
    expect(courtNumberFor(courts, "b")).toBe("VIP 2")
  })

  it("does not invent Court 1 for a missing court", () => {
    expect(courtNumberFor(courts, "removed")).toBe("")
  })

  it("projects the booked court instead of a stale draft venue", () => {
    const booking = sessionToBooking(courts, {
      courtId: "a",
      courtLabel: "Court 7",
      venue: "Club · VIP 2",
      reservationId: "paid-booking",
      status: "booked",
      roster: [],
    } as unknown as PlaySession)
    expect(booking.venue).toBe("Club · Court 7")
    expect(booking.court).toBe("Court 7")
  })

  it("preserves the operator court name in the discovery catalog", () => {
    const projected = venueCourtToCourt(
      { id: "v", name: "Club" } as Venue,
      { id: "a", name: "VIP 2", utilToday: 0 } as VenueCourt
    )
    expect(projected.name).toBe("Club · VIP 2")
    expect(courtNumberFor([projected], "a")).toBe("VIP 2")
  })
})

/**
 * Characterization tests for the pure helpers in `web/lib/shared/helpers.ts`
 * — the hand-duplicated twin of `api/src/shared/helpers.ts`. Cases below are
 * mirrored from `api/test/booking-helpers.test.ts` /
 * `api/test/session-helpers.test.ts` where the api suite exercises the same
 * shared functions; identical behavior on both copies is the whole point of
 * the hand-duplication (see CLAUDE.md). `refundPctFor`/`compactVnd` from the
 * plan's original inventory don't exist here (`refundPctFor` lives only in
 * api's booking-feature helpers, and the money formatters are
 * `formatVnd`/`formatVndFull`) — see plan 008's reviewer note.
 */

// ── formatVnd / formatVndFull ────────────────────────────────────────────────

describe("formatVnd", () => {
  it("formats a whole-thousand VND amount as a compact 'K' string", () => {
    expect(formatVnd(180000)).toBe("180K")
    expect(formatVnd(360000)).toBe("360K")
  })

  it("rounds to the nearest thousand", () => {
    expect(formatVnd(180499)).toBe("180K")
    expect(formatVnd(180500)).toBe("181K") // Math.round rounds .5 up
  })

  it("formats zero", () => {
    expect(formatVnd(0)).toBe("0K")
  })
})

describe("formatVndFull", () => {
  it("formats a small amount with a trailing ₫, no separator needed", () => {
    expect(formatVndFull(500)).toBe("500₫")
  })

  it("inserts '.' thousands separators for a 6-digit amount", () => {
    expect(formatVndFull(360000)).toBe("360.000₫")
  })

  it("inserts multiple separators for a 7-digit amount", () => {
    expect(formatVndFull(1234567)).toBe("1.234.567₫")
  })

  it("rounds a fractional amount before formatting", () => {
    expect(formatVndFull(1234.6)).toBe("1.235₫")
  })
})

// ── rangesOverlap ─────────────────────────────────────────────────────────────

describe("rangesOverlap", () => {
  it("detects an overlapping interval", () => {
    expect(rangesOverlap("18:00", 60, "18:30", 60)).toBe(true)
  })

  it("allows a back-to-back (touching, non-overlapping) interval", () => {
    expect(rangesOverlap("18:00", 60, "19:00", 60)).toBe(false)
  })

  it("allows a fully separate interval", () => {
    expect(rangesOverlap("18:00", 60, "20:00", 60)).toBe(false)
  })

  it("is symmetric — argument order doesn't change the result", () => {
    expect(rangesOverlap("18:30", 60, "18:00", 60)).toBe(true)
    expect(rangesOverlap("19:00", 60, "18:00", 60)).toBe(false)
  })

  it("detects one interval fully containing another", () => {
    expect(rangesOverlap("18:00", 120, "18:30", 30)).toBe(true)
  })
})

// ── addDaysIso / isoDateOf ────────────────────────────────────────────────────

describe("addDaysIso", () => {
  it("adds days within the same month", () => {
    expect(addDaysIso("2026-07-20", 1)).toBe("2026-07-21")
    expect(addDaysIso("2026-07-20", 5)).toBe("2026-07-25")
  })

  it("subtracts days (negative n)", () => {
    expect(addDaysIso("2026-07-20", -1)).toBe("2026-07-19")
  })

  it("rolls over a month boundary", () => {
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01") // 2026 is not a leap year
  })

  it("rolls over a year boundary", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("rolls backward over a year boundary", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31")
  })

  it("adding 0 days is a no-op", () => {
    expect(addDaysIso("2026-07-20", 0)).toBe("2026-07-20")
  })
})

describe("isoDateOf", () => {
  it("extracts the date part of an ISO datetime with a +07:00 offset", () => {
    expect(isoDateOf("2026-07-20T14:20:00+07:00")).toBe("2026-07-20")
  })

  it("is a no-op on an already-bare date", () => {
    expect(isoDateOf("2026-07-20")).toBe("2026-07-20")
  })
})

// ── dayLabelFor ───────────────────────────────────────────────────────────────

describe("dayLabelFor", () => {
  const TODAY_ISO = "2026-07-20" // a Monday

  it("labels today's date as 'Today'/'Hôm nay'", () => {
    expect(dayLabelFor(TODAY_ISO, TODAY_ISO)).toEqual({
      en: "Today",
      vi: "Hôm nay",
    })
  })

  it("labels tomorrow's date as 'Tomorrow'/'Ngày mai'", () => {
    expect(dayLabelFor("2026-07-21", TODAY_ISO)).toEqual({
      en: "Tomorrow",
      vi: "Ngày mai",
    })
  })

  it("falls back to a weekday + dd/mm label for dates further out", () => {
    expect(dayLabelFor("2026-07-25", TODAY_ISO)).toEqual({
      en: "Sat, 25/07",
      vi: "T7, 25/07",
    })
  })

  it("falls back the same way for a date in the past (history never collides with today/tomorrow)", () => {
    expect(dayLabelFor("2026-07-13", TODAY_ISO)).toEqual({
      en: "Mon, 13/07",
      vi: "T2, 13/07",
    })
  })
})

// ── hashStr ───────────────────────────────────────────────────────────────────

describe("hashStr", () => {
  it("returns a non-negative uint32 for a variety of strings", () => {
    for (const s of ["", "a", "v9c1", "2026-07-20T18:00", "hello world"]) {
      const h = hashStr(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it("is deterministic — same input always hashes to the same value", () => {
    expect(hashStr("v9c1:2026-07-20")).toBe(hashStr("v9c1:2026-07-20"))
  })

  it("different inputs (typically) hash to different values", () => {
    expect(hashStr("v9c1")).not.toBe(hashStr("v9c2"))
  })
})
