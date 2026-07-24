import { describe, expect, it } from "vitest"

import {
  PROVINCES,
  PROVINCE_OPTIONS,
  provinceCodeByName,
  wardsOf,
} from "@/lib/vn-admin"

/**
 * Shape tests for the bundled Vietnam post-2025-reform administrative units
 * dataset (`web/lib/vn-admin/units.json`) and its typed accessors. The
 * dataset is a two-tier province → ward structure (34 provinces/cities; the
 * district layer was dropped in the 2025 reform) — see plan 017.
 */

describe("PROVINCE_OPTIONS", () => {
  it("has exactly 34 provinces", () => {
    expect(PROVINCE_OPTIONS.length).toBe(34)
  })

  it("has no duplicate province codes", () => {
    const codes = PROVINCE_OPTIONS.map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe("wardsOf", () => {
  it("returns a non-empty ward list for every province", () => {
    for (const p of PROVINCES) {
      expect(wardsOf(p.code).length).toBeGreaterThan(0)
    }
  })

  it("returns [] for an undefined province code", () => {
    expect(wardsOf(undefined)).toEqual([])
  })

  it("returns [] for an unknown province code", () => {
    expect(wardsOf("nope")).toEqual([])
  })
})

describe("provinceCodeByName", () => {
  it("round-trips a known province name to its code", () => {
    const first = PROVINCES[0]
    expect(provinceCodeByName(first.name)).toBe(first.code)
  })

  it("returns undefined for an undefined name", () => {
    expect(provinceCodeByName(undefined)).toBeUndefined()
  })

  it("returns undefined for an unknown name", () => {
    expect(provinceCodeByName("Not A Real Province")).toBeUndefined()
  })
})
