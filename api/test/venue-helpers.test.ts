import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

import {
  addDaysIso,
  canTransitionBooking,
  computeChannelMix,
  computeColdSlots,
  computeCustomerStats,
  computeHourCoverage,
  computePeakHours,
  computeRevenueSeries,
  computeSportMix,
  computeUtilizationHeatmap,
  computeVenueStats,
  computeWeekdayCoverage,
  computeWeekdayHeatmap,
  courtDayEvents,
  heatmapRowLabels,
  nextDateForWeekday,
  overlapsBlock,
  venueCourtToCourt,
  weekdayLabel,
} from "../src/shared/helpers.js"
import { HEATMAP_HOURS } from "../src/shared/config.js"
import type {
  CourtBlock,
  Reservation,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueStats,
} from "../src/shared/index.js"
import {
  CourtBlockInputDto,
  CourtPatchDto,
  ReservationStatusDto,
  VenuePatchDto,
} from "../src/features/venues/venues.dto.js"

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
    sports: ["badminton"],
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

// ── canTransitionBooking ─────────────────────────────────────────────────────

void test("canTransitionBooking allows the documented forward edges", () => {
  assert.ok(canTransitionBooking("awaiting_payment", "pending"))
  assert.ok(canTransitionBooking("awaiting_payment", "expired"))
  assert.ok(canTransitionBooking("awaiting_payment", "cancelled"))
  assert.ok(canTransitionBooking("pending", "confirmed"))
  assert.ok(canTransitionBooking("pending", "cancelled"))
  assert.ok(canTransitionBooking("confirmed", "checked-in"))
  assert.ok(canTransitionBooking("confirmed", "cancelled"))
  assert.ok(canTransitionBooking("confirmed", "no-show"))
  assert.ok(canTransitionBooking("checked-in", "completed"))
  assert.ok(canTransitionBooking("checked-in", "cancelled"))
})

void test("canTransitionBooking rejects skipping or reversing states", () => {
  assert.equal(canTransitionBooking("pending", "checked-in"), false)
  assert.equal(canTransitionBooking("pending", "completed"), false)
  assert.equal(canTransitionBooking("confirmed", "pending"), false)
  assert.equal(canTransitionBooking("completed", "confirmed"), false)
  assert.equal(canTransitionBooking("awaiting_payment", "confirmed"), false)
})

void test("canTransitionBooking treats terminal statuses as having no outgoing edges", () => {
  assert.equal(canTransitionBooking("completed", "cancelled"), false)
  assert.equal(canTransitionBooking("cancelled", "confirmed"), false)
  assert.equal(canTransitionBooking("no-show", "completed"), false)
  assert.equal(canTransitionBooking("expired", "pending"), false)
})

void test("canTransitionBooking allows a same-status PUT as an idempotent no-op", () => {
  assert.ok(canTransitionBooking("pending", "pending"))
  assert.ok(canTransitionBooking("completed", "completed"))
  assert.ok(canTransitionBooking("cancelled", "cancelled"))
  assert.ok(canTransitionBooking("awaiting_payment", "awaiting_payment"))
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
    makeReservation({
      id: "e",
      status: "confirmed",
      price: 999999,
      dayKey: TOMORROW_ISO,
    }), // not today
  ]
  const stats = computeVenueStats(
    makeVenue(),
    courts,
    reservations,
    BASE_STATS,
    TODAY_ISO
  )
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
  const stats = computeVenueStats(
    venue,
    courts,
    reservations,
    BASE_STATS,
    TODAY_ISO
  )
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
  const stats = computeVenueStats(
    makeVenue(),
    [makeCourt()],
    reservations,
    BASE_STATS,
    TODAY_ISO
  )
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
    makeReservation({
      id: "a",
      userId: "u1",
      customer: { name: "A", initials: "A" },
    }),
    makeReservation({
      id: "b",
      userId: "u1",
      customer: { name: "A", initials: "A" },
    }), // dup user
    makeReservation({
      id: "c",
      source: "walk-in",
      userId: undefined,
      customer: { name: "B", initials: "B", phone: "0911" },
    }),
    makeReservation({
      id: "d",
      source: "walk-in",
      userId: undefined,
      customer: { name: "B", initials: "B", phone: "0911" },
    }), // dup phone
    makeReservation({
      id: "e",
      userId: "u2",
      customer: { name: "C", initials: "C" },
    }),
    makeReservation({
      id: "f",
      userId: "u3",
      status: "cancelled",
      customer: { name: "D", initials: "D" },
    }), // excluded
    makeReservation({
      id: "g",
      userId: "u4",
      status: "no-show",
      customer: { name: "E", initials: "E" },
    }), // excluded
  ]
  const stats = computeVenueStats(
    makeVenue(),
    [makeCourt()],
    reservations,
    BASE_STATS,
    TODAY_ISO
  )
  // distinct kept keys: u1, phone 0911, u2 → 3
  assert.equal(stats.newCustomers, 3)
})

// ── Phase 10: real analytics from a venue's own reservations ─────────────────

void test("computeRevenueSeries returns 7 days oldest → today, labeled by real weekday", () => {
  const series = computeRevenueSeries(
    [
      makeReservation({
        status: "confirmed",
        price: 180000,
        dayKey: TODAY_ISO,
      }),
    ],
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
    makeReservation({
      id: "a",
      status: "confirmed",
      price: 100000,
      dayKey: TODAY_ISO,
    }),
    makeReservation({
      id: "b",
      status: "completed",
      price: 50000,
      dayKey: TODAY_ISO,
    }),
    makeReservation({
      id: "c",
      status: "pending",
      price: 999999,
      dayKey: TODAY_ISO,
    }), // excluded
    makeReservation({
      id: "d",
      status: "cancelled",
      price: 999999,
      dayKey: TODAY_ISO,
    }), // excluded
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
  // Badminton is now the only sport, so the mix has a single entry; this still
  // exercises that live bookings are counted per sport and cancelled ones excluded.
  const reservations = [
    makeReservation({ id: "a", sport: "badminton" }),
    makeReservation({ id: "b", sport: "badminton" }),
    makeReservation({ id: "c", sport: "badminton" }),
    makeReservation({ id: "d", sport: "badminton", status: "cancelled" }),
  ]
  const mix = computeSportMix(reservations)
  const badminton = mix.find((m) => m.sport === "badminton")
  assert.equal(mix.length, 1)
  assert.equal(badminton?.bookings, 3)
  assert.equal(badminton?.pct, 100)
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
    makeReservation({
      id: "a",
      courtId: "v9c1",
      start: "19:00",
      durationMin: 60,
    }),
    makeReservation({
      id: "b",
      courtId: "v9c2",
      start: "19:00",
      durationMin: 60,
    }),
    makeReservation({
      id: "c",
      courtId: "v9c1",
      start: "09:00",
      durationMin: 60,
    }),
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

// ── Weekday × hour occupancy heatmap & cold-slot handling ───────────────────
// TODAY_ISO ("2026-07-13") is a Monday, i.e. Mon-first weekdayIdx 0.

void test("computeWeekdayHeatmap buckets a reservation onto its real weekday row", () => {
  const heatmap = computeWeekdayHeatmap(
    [makeCourt()],
    [makeReservation({ dayKey: TODAY_ISO, start: "18:00", durationMin: 60 })]
  )
  assert.equal(heatmap.length, 7)
  assert.equal(heatmap[0].length, HEATMAP_HOURS.length)
  const hourIdx = HEATMAP_HOURS.indexOf("18")
  assert.equal(heatmap[0][hourIdx], 100) // Monday · 18:00 column, only date on record
  assert.ok(heatmap.slice(1).every((row) => row.every((v) => v === 0)))
})

void test("computeWeekdayHeatmap averages a busy date against a quiet date on the same weekday", () => {
  const heatmap = computeWeekdayHeatmap(
    [makeCourt()],
    [
      makeReservation({
        id: "a",
        dayKey: TODAY_ISO, // Monday, booked at 18:00
        start: "18:00",
        durationMin: 60,
      }),
      makeReservation({
        id: "b",
        dayKey: addDaysIso(TODAY_ISO, -14), // a different Monday, booked at 08:00 only
        start: "08:00",
        durationMin: 60,
      }),
    ]
  )
  const hourIdx = HEATMAP_HOURS.indexOf("18")
  // One Monday on record booked 18:00, the other didn't → 50% average.
  assert.equal(heatmap[0][hourIdx], 50)
})

void test("computeWeekdayHeatmap ignores cancelled reservations", () => {
  const heatmap = computeWeekdayHeatmap(
    [makeCourt()],
    [
      makeReservation({
        dayKey: TODAY_ISO,
        start: "18:00",
        status: "cancelled",
      }),
    ]
  )
  assert.ok(heatmap.every((row) => row.every((v) => v === 0)))
})

void test("computeHourCoverage averages occupancy per hour across every date on record", () => {
  const coverage = computeHourCoverage(
    [makeCourt()],
    [
      makeReservation({ id: "a", dayKey: TODAY_ISO, start: "18:00" }),
      makeReservation({
        id: "b",
        dayKey: addDaysIso(TODAY_ISO, -1),
        start: "08:00",
      }),
    ]
  )
  assert.equal(coverage.length, HEATMAP_HOURS.length)
  // 2 dates on record; each hour is booked on exactly 1 of them → 50%.
  assert.equal(coverage.find((p) => p.hour === "18:00")?.util, 50)
  assert.equal(coverage.find((p) => p.hour === "08:00")?.util, 50)
})

void test("computeHourCoverage is all-zero with no reservations", () => {
  const coverage = computeHourCoverage([makeCourt()], [])
  assert.ok(coverage.every((p) => p.util === 0))
})

void test("computeWeekdayCoverage averages each weekday's heatmap row", () => {
  const court = makeCourt()
  const reservations = [
    makeReservation({ dayKey: TODAY_ISO, start: "18:00", durationMin: 120 }),
  ]
  const heatmap = computeWeekdayHeatmap([court], reservations)
  const coverage = computeWeekdayCoverage([court], reservations)
  assert.equal(coverage.length, 7)
  coverage.forEach((point, i) => {
    assert.equal(point.weekdayIdx, i)
    const expected = Math.round(
      heatmap[i].reduce((sum, v) => sum + v, 0) / heatmap[i].length
    )
    assert.equal(point.util, expected)
  })
})

void test("computeColdSlots returns the quietest cells first, respecting threshold and limit", () => {
  const heatmap = [
    [80, 10, 0, 90],
    [5, 100, 20, 60],
  ]
  const cold = computeColdSlots(heatmap, ["08", "10", "12", "14"], {
    threshold: 30,
    limit: 3,
  })
  assert.deepEqual(
    cold.map((s) => s.util),
    [0, 5, 10]
  )
  assert.ok(cold.every((s) => s.util <= 30))
})

void test("computeColdSlots defaults to a limit of 6 quietest cells", () => {
  const heatmap: number[][] = [Array<number>(7).fill(0)]
  const cold = computeColdSlots(heatmap, HEATMAP_HOURS.slice(0, 7))
  assert.equal(cold.length, 6)
})

void test("nextDateForWeekday returns today when today already matches", () => {
  assert.equal(nextDateForWeekday(0, TODAY_ISO), TODAY_ISO)
})

void test("nextDateForWeekday returns the nearest upcoming date otherwise", () => {
  assert.equal(nextDateForWeekday(1, TODAY_ISO), addDaysIso(TODAY_ISO, 1)) // Tue
  assert.equal(nextDateForWeekday(6, TODAY_ISO), addDaysIso(TODAY_ISO, 6)) // Sun
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
  const events = courtDayEvents(
    makeVenue(),
    [makeCourt()],
    "v9c1",
    TODAY_ISO,
    TODAY_ISO
  )
  assert.ok(events.length > 0)
})

// ── computeCustomerStats (Phase 6, decision #15/default) ────────────────────

function makeCustomer(overrides: Partial<VenueCustomer> = {}): VenueCustomer {
  return {
    id: "0900000000",
    name: "Khách",
    initials: "K",
    favoriteSport: "badminton",
    visits: 99, // seeded values the recompute must fully replace
    lastVisit: { en: "Never", vi: "Chưa từng" },
    ltv: 99,
    noShowRate: 99,
    tier: "vip",
    trend: 0,
    ...overrides,
  }
}

void test("computeCustomerStats matches a walk-in customer by phone", () => {
  const customer = makeCustomer({ id: "0911111111" })
  const reservations = [
    makeReservation({
      id: "a",
      status: "completed",
      price: 200000,
      customer: { name: "K", initials: "K", phone: "0911111111" },
      userId: undefined,
    }),
    makeReservation({
      id: "b",
      status: "completed",
      price: 300000,
      customer: { name: "Other", initials: "O", phone: "0922222222" },
      userId: undefined,
    }), // a different phone — excluded
  ]
  const [result] = computeCustomerStats([customer], reservations)
  assert.equal(result?.visits, 1)
  assert.equal(result?.ltv, 200000)
})

void test("computeCustomerStats matches a linked app customer by userId, not phone", () => {
  const customer = makeCustomer({ id: "user-1", userId: "user-1" })
  const reservations = [
    makeReservation({
      id: "a",
      status: "completed",
      price: 200000,
      userId: "user-1",
      customer: { name: "K", initials: "K" },
    }),
  ]
  const [result] = computeCustomerStats([customer], reservations)
  assert.equal(result?.visits, 1)
})

void test("computeCustomerStats counts visits/ltv only from completed bookings", () => {
  const customer = makeCustomer({ id: "0911111111" })
  const phone = "0911111111"
  const reservations = [
    makeReservation({
      id: "a",
      status: "completed",
      price: 100000,
      customer: { name: "K", initials: "K", phone },
    }),
    makeReservation({
      id: "b",
      status: "confirmed", // not a visit yet
      price: 999999,
      customer: { name: "K", initials: "K", phone },
    }),
    makeReservation({
      id: "c",
      status: "cancelled", // never a visit
      price: 999999,
      customer: { name: "K", initials: "K", phone },
    }),
  ]
  const [result] = computeCustomerStats([customer], reservations)
  assert.equal(result?.visits, 1)
  assert.equal(result?.ltv, 100000)
})

void test("computeCustomerStats derives noShowRate over completed/checked-in/no-show only", () => {
  const customer = makeCustomer({ id: "0911111111" })
  const phone = "0911111111"
  const reservations = [
    makeReservation({
      id: "a",
      status: "no-show",
      customer: { name: "K", initials: "K", phone },
    }),
    makeReservation({
      id: "b",
      status: "completed",
      customer: { name: "K", initials: "K", phone },
    }),
    makeReservation({
      id: "c",
      status: "pending", // ignored
      customer: { name: "K", initials: "K", phone },
    }),
  ]
  const [result] = computeCustomerStats([customer], reservations)
  // 1 no-show / 2 counted = 50%
  assert.equal(result?.noShowRate, 50)
})

void test("computeCustomerStats tiers: at-risk (trend<=-20) beats the visit-count bands", () => {
  const reservations: Reservation[] = []
  const [result] = computeCustomerStats(
    [makeCustomer({ id: "0911111111", visits: 0, trend: -34 })],
    reservations
  )
  assert.equal(result?.tier, "at-risk")
})

void test("computeCustomerStats tiers: vip at >=40 visits, regular at >=10, else new", () => {
  const phone = "0911111111"
  const completed = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeReservation({
        id: `c${i}`,
        status: "completed",
        customer: { name: "K", initials: "K", phone },
      })
    )
  const vip = computeCustomerStats(
    [makeCustomer({ id: phone, trend: 0 })],
    completed(40)
  )[0]
  const regular = computeCustomerStats(
    [makeCustomer({ id: phone, trend: 0 })],
    completed(10)
  )[0]
  const brandNew = computeCustomerStats(
    [makeCustomer({ id: phone, trend: 0 })],
    completed(0)
  )[0]
  assert.equal(vip?.tier, "vip")
  assert.equal(regular?.tier, "regular")
  assert.equal(brandNew?.tier, "new")
})

void test("computeCustomerStats leaves lastVisit/trend untouched (not re-derived)", () => {
  const customer = makeCustomer({
    id: "0911111111",
    trend: 7,
    lastVisit: { en: "3 weeks ago", vi: "3 tuần trước" },
  })
  const [result] = computeCustomerStats([customer], [])
  assert.equal(result?.trend, 7)
  assert.deepEqual(result?.lastVisit, { en: "3 weeks ago", vi: "3 tuần trước" })
})

// ── overlapsBlock (Phase 6, decision #12) ────────────────────────────────────

function makeBlock(overrides: Partial<CourtBlock> = {}): CourtBlock {
  return {
    id: "v9b1",
    courtId: "v9c1",
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
    reason: "maintenance",
    ...overrides,
  }
}

void test("overlapsBlock is true for an overlapping slot on the same court+day", () => {
  const blocks = [makeBlock()]
  assert.ok(overlapsBlock(blocks, "v9c1", TODAY_ISO, "18:30", 30))
})

void test("overlapsBlock ignores a different court, a different day, or a non-overlapping time", () => {
  const blocks = [makeBlock()]
  assert.equal(overlapsBlock(blocks, "v9c2", TODAY_ISO, "18:00", 60), false)
  assert.equal(overlapsBlock(blocks, "v9c1", TOMORROW_ISO, "18:00", 60), false)
  assert.equal(overlapsBlock(blocks, "v9c1", TODAY_ISO, "19:00", 60), false)
})

// ── venues.dto.ts: archived + court-block validation (Phase 6) ──────────────

function dtoErrors(cls: new () => object, input: unknown): number {
  const dto = plainToInstance(cls, input)
  return validateSync(dto).length
}

void test("VenuePatchDto/CourtPatchDto accept an optional boolean archived field", () => {
  assert.equal(dtoErrors(VenuePatchDto, {}), 0)
  assert.equal(dtoErrors(VenuePatchDto, { archived: true }), 0)
  assert.equal(dtoErrors(VenuePatchDto, { archived: false }), 0)
  assert.notEqual(dtoErrors(VenuePatchDto, { archived: "yes" }), 0)
  assert.equal(dtoErrors(CourtPatchDto, { archived: false }), 0)
  assert.notEqual(dtoErrors(CourtPatchDto, { archived: "yes" }), 0)
})

void test("CourtBlockInputDto requires a reason from the fixed enum", () => {
  const base = {
    courtId: "v9c1",
    dateKey: TODAY_ISO,
    start: "18:00",
    durationMin: 60,
  }
  assert.equal(
    dtoErrors(CourtBlockInputDto, { ...base, reason: "maintenance" }),
    0
  )
  assert.equal(dtoErrors(CourtBlockInputDto, { ...base, reason: "vip" }), 0)
  assert.notEqual(
    dtoErrors(CourtBlockInputDto, { ...base, reason: "lunch" }),
    0
  )
  assert.notEqual(dtoErrors(CourtBlockInputDto, base), 0) // reason missing
})

void test("CourtBlockInputDto validates start (HH:MM) and durationMin bounds", () => {
  const base = {
    courtId: "v9c1",
    dateKey: TODAY_ISO,
    reason: "break",
  }
  assert.equal(
    dtoErrors(CourtBlockInputDto, { ...base, start: "18:00", durationMin: 60 }),
    0
  )
  assert.notEqual(
    dtoErrors(CourtBlockInputDto, { ...base, start: "18:60", durationMin: 60 }),
    0
  )
  assert.notEqual(
    dtoErrors(CourtBlockInputDto, { ...base, start: "18:00", durationMin: 5 }),
    0
  )
})
