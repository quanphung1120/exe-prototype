import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { distanceKmBetween, compareDistance } from "../src/shared/location.js"
import { venueCourtToCourt, venueToPin } from "../src/shared/helpers.js"
import type { Venue, VenueCourt } from "../src/shared/types.js"

void test("distance is based on real coordinates and stays unknown without them", () => {
  assert.equal(distanceKmBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 111.2)
  assert.equal(distanceKmBetween(null, { lat: 0, lng: 0 }), null)
  assert.equal(distanceKmBetween({ lat: 91, lng: 0 }, { lat: 0, lng: 0 }), null)
  assert.equal(compareDistance({ distanceKm: null }, { distanceKm: null }), 0)
  assert.ok(compareDistance({ distanceKm: null }, { distanceKm: 0 }) > 0)
})

void test("missing venue location never becomes a fake HCMC location or distance", () => {
  const venue = { id: "v", name: "Club" } as Venue
  const court = venueCourtToCourt(venue, {
    id: "a",
    name: "A",
    utilToday: 0,
  } as VenueCourt)
  assert.equal(court.lat, null)
  assert.equal(court.lng, null)
  assert.equal(court.distanceKm, null)
  assert.equal(venueToPin(venue).lat, null)
})

void test("web and API use the same location calculation and validation", () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")
  assert.equal(
    read("../src/shared/location.ts"),
    read("../../web/lib/shared/location.ts")
  )
})
