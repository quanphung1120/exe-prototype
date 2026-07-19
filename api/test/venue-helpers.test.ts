import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import {
  addDaysIso,
  canTransitionReservation,
  computeChannelMix,
  computePeakHours,
  computeRevenueSeries,
  computeSportMix,
  computeUtilizationHeatmap,
  computeVenueStats,
  courtDayEvents,
  heatmapRowLabels,
  venueCourtToCourt,
  weekdayLabel,
} from "../src/shared/helpers.js"
import type {
  Reservation,
  Venue,
  VenueCourt,
  VenueStats,
} from "../src/shared/index.js"
import { ReservationStatusDto } from "../src/features/venues/venues.dto.js"

/**
 * Pure-helper tests for the cross-surface backbone (VienTD-Review #08): the
 * unified court catalog projection and the hybrid analytics recompute. Both are
 * deterministic (no Date/random) so the same fixtures always assert the same
 * numbers — which is also what keeps SSR and client renders in agreement.
 */

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "v9",
    ownerId: "owner-1",
    name: "QA Arena",
    initials: "QA",
    district: "Cầu Giấy",
    city: "Hà Nội",
    sports: ["badminton", "pickleball"],
    openFrom: "06:00",
    openTo: "22:00",
    rating: 4.6,
    reviews: 128,
    manager: { name: "Quan", initials: "Q" },
    now: "14:00",
    lat: 21.03,
    lng: 105.79,
    ...overrides,
  }
}

function makeCourt(overrides: Partial<VenueCourt> = {}): VenueCourt {
  return {
    id: "v9c1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Thảm",
    state: "available",
    utilToday: 40,
    pricePerHour: 180000,
    ...overrides,
  }
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "rv-1",
    customer: { name: "Khách", initials: "K", phone: "0900000000" },
    sport: "badminton",
    courtId: "v9c1",
    court: "Sân 1",
    dayKey: TODAY_ISO,
    day: { en: "Today", vi: "Hôm nay" },
    start: "18:00",
    durationMin: 60,
    time: "18:00 – 19:00",
    party: 2,
    source: "app",
    status: "confirmed",
    price: 180000,
    noShowRisk: 10,
    isRegular: false,
    ...overrides,
  }
}

const TODAY_ISO = "2026-07-13"
const TOMORROW_ISO = "2026-07-14"

const BASE_STATS: VenueStats = {
  occupancy: 55,
  occupancyDelta: 3,
  revenueToday: 999999,
  revenueDelta: 5,
  bookingsToday: 12,
  bookingsDelta: 2,
  noShowRate: 99,
  noShowDelta: -1,
  newCustomers: 99,
  newCustomersDelta: 4,
  utilization: 99,
}

// ── canTransitionReservation ────────────────────────────────────────────────

void test("canTransitionReservation allows the documented forward edges", () => {
  assert.ok(canTransitionReservation("pending", "confirmed"))
  assert.ok(canTransitionReservation("pending", "cancelled"))
  assert.ok(canTransitionReservation("confirmed", "checked-in"))
  assert.ok(canTransitionReservation("confirmed", "cancelled"))
  assert.ok(canTransitionReservation("confirmed", "no-show"))
  assert.ok(canTransitionReservation("checked-in", "completed"))
  assert.ok(canTransitionReservation("checked-in", "cancelled"))
})

void test("canTransitionReservation rejects skipping or reversing states", () => {
  assert.equal(canTransitionReservation("pending", "checked-in"), false)
  assert.equal(canTransitionReservation("pending", "completed"), false)
  assert.equal(canTransitionReservation("confirmed", "pending"), false)
  assert.equal(canTransitionReservation("completed", "confirmed"), false)
})

void test("canTransitionReservation treats terminal statuses as having no outgoing edges", () => {
  assert.equal(canTransitionReservation("completed", "cancelled"), false)
  assert.equal(canTransitionReservation("cancelled", "confirmed"), false)
  assert.equal(canTransitionReservation("no-show", "completed"), false)
})

void test("canTransitionReservation allows a same-status PUT as an idempotent no-op", () => {
  assert.ok(canTransitionReservation("pending", "pending"))
  assert.ok(canTransitionReservation("completed", "completed"))
  assert.ok(canTransitionReservation("cancelled", "cancelled"))
})

// ── ReservationStatusDto ─────────────────────────────────────────────────────

/** Mirror the global ValidationPipe: valid iff class-validator finds no errors. */
function statusDtoValid(input: unknown): boolean {
  const dto = plainToInstance(ReservationStatusDto, input)
  return validateSync(dto).length === 0
}

void test("ReservationStatusDto requires a reason (>=3 chars) when cancelling", () => {
  assert.equal(statusDtoValid({ status: "cancelled" }), false)
  assert.equal(statusDtoValid({ status: "cancelled", reason: "no" }), false)
  assert.equal(
    statusDtoValid({ status: "cancelled", reason: "Sân bảo trì" }),
    true
  )
})

void test("ReservationStatusDto does not require a reason for other statuses", () => {
  assert.equal(statusDtoValid({ status: "confirmed" }), true)
  assert.equal(statusDtoValid({ status: "checked-in" }), true)
  assert.equal(statusDtoValid({ status: "no-show" }), true)
})

// ── venueCourtToCourt ─────────────────────────────────────────────────────────

void test("venueCourtToCourt keeps the vc* id so a booking resolves its venue", () => {
  const court = venueCourtToCourt(makeVenue(), makeCourt({ id: "v9c3" }))
  assert.equal(court.id, "v9c3")
  assert.equal(court.name, "QA Arena · Sân 1")
  assert.deepEqual(court.sports, ["badminton"])
  assert.equal(court.pricePerHour, 180000)
})

void test("venueCourtToCourt is deterministic (SSR-safe)", () => {
  const a = venueCourtToCourt(makeVenue(), makeCourt())
  const b = venueCourtToCourt(makeVenue(), makeCourt())
  assert.deepEqual(a, b)
})

void test("venueCourtToCourt jitters distinct courts off one marker", () => {
  const v = makeVenue()
  const c1 = venueCourtToCourt(v, makeCourt({ id: "v9c1" }))
  const c2 = venueCourtToCourt(v, makeCourt({ id: "v9c2" }))
  assert.notEqual(`${c1.lat},${c1.lng}`, `${c2.lat},${c2.lng}`)
})

void test("venueCourtToCourt derives free slots from utilToday", () => {
  const busy = venueCourtToCourt(makeVenue(), makeCourt({ utilToday: 100 }))
  const idle = venueCourtToCourt(makeVenue(), makeCourt({ utilToday: 0 }))
  assert.equal(busy.freePct, 0)
  assert.equal(busy.openSlots, 0)
  assert.equal(idle.freePct, 100)
  assert.ok(idle.openSlots > 0)
})

// ── computeVenueStats ─────────────────────────────────────────────────────────

void test("computeVenueStats sums only today's confirmed/completed revenue", () => {
  const courts = [makeCourt()]
  const reservations = [
    makeReservation({ id: "a", status: "confirmed", price: 180000 }),
    makeReservation({ id: "b", status: "completed", price: 200000 }),
    makeReservation({ id: "c", status: "pending", price: 999999 }), // excluded
    makeReservation({ id: "d", status: "cancelled", price: 999999 }), // excluded
    makeReservation({ id: "e", status: "confirmed", price: 999999, dayKey: TOMORROW_ISO }), // not today
  ]
  const stats = computeVenueStats(makeVenue(), courts, reservations, BASE_STATS, TODAY_ISO)
  assert.equal(stats.revenueToday, 380000)
  // untouched seed KPIs pass through
  assert.equal(stats.occupancy, 55)
})

void test("computeVenueStats utilization = booked minutes ÷ open court-minutes", () => {
  // Two courts, 06:00–22:00 = 960 min each → 1920 open minutes.
  const venue = makeVenue({ openFrom: "06:00", openTo: "22:00" })
  const courts = [makeCourt({ id: "v9c1" }), makeCourt({ id: "v9c2" })]
  const reservations = [
    makeReservation({ id: "a", status: "confirmed", durationMin: 60 }),
    makeReservation({ id: "b", status: "checked-in", durationMin: 120 }),
    makeReservation({ id: "c", status: "pending", durationMin: 480 }), // not counted
  ]
  const stats = computeVenueStats(venue, courts, reservations, BASE_STATS, TODAY_ISO)
  // (60 + 120) / 1920 = 9.375% → 9
  assert.equal(stats.utilization, 9)
})

void test("computeVenueStats no-show rate over completed/checked-in/no-show only", () => {
  const reservations = [
    makeReservation({ id: "a", status: "no-show" }),
    makeReservation({ id: "b", status: "completed" }),
    makeReservation({ id: "c", status: "checked-in" }),
    makeReservation({ id: "d", status: "pending" }), // ignored
    makeReservation({ id: "e", status: "confirmed" }), // ignored
  ]
  const stats = computeVenueStats(makeVenue(), [makeCourt()], reservations, BASE_STATS, TODAY_ISO)
  // 1 no-show / 3 counted = 33%
  assert.equal(stats.noShowRate, 33)
})

void test("computeVenueStats no-show rate is 0 with no countable history", () => {
  const stats = computeVenueStats(
    makeVenue(),
    [makeCourt()],
    [makeReservation({ status: "pending" })],
    BASE_STATS,
    TODAY_ISO
  )
  assert.equal(stats.noShowRate, 0)
})

void test("computeVenueStats counts distinct app users + walk-in phones, minus cancels", () => {
  const reservations = [
    makeReservation({ id: "a", userId: "u1", customer: { name: "A", initials: "A" } }),
    makeReservation({ id: "b", userId: "u1", customer: { name: "A", initials: "A" } }), // dup user
    makeReservation({ id: "c", source: "walk-in", userId: undefined, customer: { name: "B", initials: "B", phone: "0911" } }),
    makeReservation({ id: "d", source: "walk-in", userId: undefined, customer: { name: "B", initials: "B", phone: "0911" } }), // dup phone
    makeReservation({ id: "e", userId: "u2", customer: { name: "C", initials: "C" } }),
    makeReservation({ id: "f", userId: "u3", status: "cancelled", customer: { name: "D", initials: "D" } }), // excluded
    makeReservation({ id: "g", userId: "u4", status: "no-show", customer: { name: "E", initials: "E" } }), // excluded
  ]
  const stats = computeVenueStats(makeVenue(), [makeCourt()], reservations, BASE_STATS, TODAY_ISO)
  // distinct kept keys: u1, phone 0911, u2 → 3
  assert.equal(stats.newCustomers, 3)
})

// ── Phase 10: real analytics from a venue's own reservations ─────────────────

void test("computeRevenueSeries returns 7 days oldest → today, labeled by real weekday", () => {
  const series = computeRevenueSeries(
    [makeReservation({ status: "confirmed", price: 180000, dayKey: TODAY_ISO })],
    TODAY_ISO
  )
  assert.equal(series.length, 7)
  assert.deepEqual(series[6].label, weekdayLabel(TODAY_ISO))
  assert.equal(series[6].value, 180000)
  // every earlier day has no reservations → 0
  assert.ok(series.slice(0, 6).every((p) => p.value === 0))
})

void test("computeRevenueSeries only counts confirmed/completed revenue on their real day", () => {
  const reservations = [
    makeReservation({ id: "a", status: "confirmed", price: 100000, dayKey: TODAY_ISO }),
    makeReservation({ id: "b", status: "completed", price: 50000, dayKey: TODAY_ISO }),
    makeReservation({ id: "c", status: "pending", price: 999999, dayKey: TODAY_ISO }), // excluded
    makeReservation({ id: "d", status: "cancelled", price: 999999, dayKey: TODAY_ISO }), // excluded
    makeReservation({
      id: "e",
      status: "confirmed",
      price: 70000,
      dayKey: addDaysIso(TODAY_ISO, -2),
    }),
  ]
  const series = computeRevenueSeries(reservations, TODAY_ISO)
  assert.equal(series[6].value, 150000)
  assert.equal(series[4].value, 70000) // today - 2
})

void test("computeSportMix shares live bookings per sport and excludes cancelled", () => {
  const reservations = [
    makeReservation({ id: "a", sport: "badminton" }),
    makeReservation({ id: "b", sport: "badminton" }),
    makeReservation({ id: "c", sport: "pickleball" }),
    makeReservation({ id: "d", sport: "badminton", status: "cancelled" }),
  ]
  const mix = computeSportMix(reservations)
  const badminton = mix.find((m) => m.sport === "badminton")
  const pickleball = mix.find((m) => m.sport === "pickleball")
  assert.equal(badminton?.bookings, 2)
  assert.equal(badminton?.pct, 67)
  assert.equal(pickleball?.bookings, 1)
  assert.equal(pickleball?.pct, 33)
})

void test("computeSportMix is empty for a venue with no live bookings", () => {
  assert.deepEqual(computeSportMix([]), [])
  assert.deepEqual(
    computeSportMix([makeReservation({ status: "cancelled" })]),
    []
  )
})

void test("computeChannelMix always reports both app and walk-in, even at 0%", () => {
  const mix = computeChannelMix([makeReservation({ source: "app" })])
  assert.deepEqual(
    mix.map((m) => m.source),
    ["app", "walk-in"]
  )
  assert.equal(mix.find((m) => m.source === "app")?.pct, 100)
  assert.equal(mix.find((m) => m.source === "walk-in")?.pct, 0)
})

void test("computeChannelMix excludes cancelled reservations from the split", () => {
  const mix = computeChannelMix([
    makeReservation({ id: "a", source: "app" }),
    makeReservation({ id: "b", source: "walk-in" }),
    makeReservation({ id: "c", source: "walk-in", status: "cancelled" }),
  ])
  assert.equal(mix.find((m) => m.source === "app")?.pct, 50)
  assert.equal(mix.find((m) => m.source === "walk-in")?.pct, 50)
})

void test("computePeakHours ranks the hour with more occupied courts higher, top 4", () => {
  const courts = [makeCourt({ id: "v9c1" }), makeCourt({ id: "v9c2" })]
  const reservations = [
    makeReservation({ id: "a", courtId: "v9c1", start: "19:00", durationMin: 60 }),
    makeReservation({ id: "b", courtId: "v9c2", start: "19:00", durationMin: 60 }),
    makeReservation({ id: "c", courtId: "v9c1", start: "09:00", durationMin: 60 }),
  ]
  const peaks = computePeakHours(courts, reservations)
  assert.equal(peaks.length, 4)
  assert.equal(peaks[0].hour, "19:00")
  assert.equal(peaks[0].util, 100) // both courts occupied
  assert.ok(peaks[0].util >= peaks[1].util)
})

void test("computePeakHours ignores cancelled reservations", () => {
  const peaks = computePeakHours(
    [makeCourt()],
    [makeReservation({ start: "19:00", status: "cancelled" })]
  )
  assert.ok(peaks.every((p) => p.util === 0))
})

void test("computeUtilizationHeatmap is a 7-day zeroed grid for a venue with no reservations", () => {
  const heatmap = computeUtilizationHeatmap([makeCourt()], [], TODAY_ISO)
  assert.equal(heatmap.length, 7)
  assert.ok(heatmap.every((row) => row.every((v) => v === 0)))
})

void test("computeUtilizationHeatmap marks today's real reservation on its real hour", () => {
  const heatmap = computeUtilizationHeatmap(
    [makeCourt()],
    [makeReservation({ start: "18:00", durationMin: 60, dayKey: TODAY_ISO })],
    TODAY_ISO
  )
  // Last row = today; the "18" column (18:00 falls in the 18:00–20:00 bucket).
  assert.ok(heatmap[6].some((v) => v === 100))
})

void test("heatmapRowLabels labels the real 7-day window, oldest → today", () => {
  const labels = heatmapRowLabels(TODAY_ISO)
  assert.equal(labels.length, 7)
  assert.deepEqual(labels[6], weekdayLabel(TODAY_ISO))
  assert.deepEqual(labels[0], weekdayLabel(addDaysIso(TODAY_ISO, -6)))
})

// ── Phase 10: courtDayEvents fake filler disabled for owned venues ──────────

void test("courtDayEvents returns no fabricated filler when fillerEnabled is false", () => {
  const events = courtDayEvents(
    makeVenue(),
    [makeCourt()],
    "v9c1",
    TODAY_ISO,
    TODAY_ISO,
    false
  )
  assert.deepEqual(events, [])
})

void test("courtDayEvents still returns a real maintenance block when filler is disabled", () => {
  const court = makeCourt({ state: "maintenance" })
  const events = courtDayEvents(
    makeVenue(),
    [court],
    court.id,
    TODAY_ISO,
    TODAY_ISO,
    false
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].kind, "blocked")
})

void test("courtDayEvents fabricates filler by default (fillerEnabled defaults to true)", () => {
  const events = courtDayEvents(makeVenue(), [makeCourt()], "v9c1", TODAY_ISO, TODAY_ISO)
  assert.ok(events.length > 0)
})
