import { describe, expect, it } from "vitest"
import { compareDistance, distanceKmBetween, hasCoordinates } from "./location"
import { venueCourtToCourt, venueToPin } from "./helpers"
import type { Venue, VenueCourt } from "./types"

describe("real court distance", () => {
  it("calculates distance from the viewer, including outside HCMC", () => {
    expect(distanceKmBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBe(
      111.2
    )
    expect(
      distanceKmBetween({ lat: 21.03, lng: 105.83 }, { lat: 10.77, lng: 106.7 })
    ).toBeGreaterThan(1100)
    expect(
      distanceKmBetween(
        { lat: 21.03, lng: 105.83 },
        { lat: 21.03, lng: 105.83 }
      )
    ).toBe(0)
  })

  it("keeps denied location and missing or invalid venue coordinates unknown", () => {
    expect(distanceKmBetween(null, { lat: 10.77, lng: 106.7 })).toBeNull()
    expect(
      distanceKmBetween({ lat: 10.77, lng: 106.7 }, { lat: null, lng: null })
    ).toBeNull()
    expect(hasCoordinates({ lat: NaN, lng: 106 })).toBe(false)
    expect(hasCoordinates({ lat: 91, lng: 106 })).toBe(false)
    expect(hasCoordinates({ lat: 0, lng: 0 })).toBe(true)
  })

  it("sorts real distances first and treats unknown values equally", () => {
    const sorted = [
      { distanceKm: null },
      { distanceKm: 8 },
      { distanceKm: 0 },
    ].sort(compareDistance)
    expect(sorted.map((c) => c.distanceKm)).toEqual([0, 8, null])
    expect(compareDistance({ distanceKm: null }, { distanceKm: null })).toBe(0)
  })

  it("preserves venue coordinates for every court instead of shifting them", () => {
    const venue = { id: "v", name: "Club", lat: 21.03, lng: 105.83 } as Venue
    for (const id of ["a", "b"]) {
      const court = venueCourtToCourt(venue, {
        id,
        name: id,
        utilToday: 0,
      } as VenueCourt)
      expect(court.lat).toBe(venue.lat)
      expect(court.lng).toBe(venue.lng)
      expect(court.distanceKm).toBeNull()
    }
  })

  it("does not put a venue with missing coordinates in central HCMC", () => {
    const venue = { id: "v", name: "Club" } as Venue
    const court = venueCourtToCourt(venue, {
      id: "a",
      name: "A",
      utilToday: 0,
    } as VenueCourt)
    expect(hasCoordinates(court)).toBe(false)
    expect(hasCoordinates(venueToPin(venue))).toBe(false)
    expect(court.distanceKm).toBeNull()
  })
})
