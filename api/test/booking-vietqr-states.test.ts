import assert from "node:assert/strict"
import test from "node:test"

import { bookingsOverlap } from "../src/features/bookings/booking.helpers.js"
import { canTransitionBooking } from "../src/shared/helpers.js"
import type { BookingRecordStatus } from "../src/shared/index.js"

const slot = (status: BookingRecordStatus) => ({
  bookingId: "b1",
  courtId: "c1",
  dateKey: "2026-10-20",
  start: "18:00",
  durationMin: 60,
  status,
})

void test("the VietQR flow walks pay → verify → confirm, or reject → refund", () => {
  assert.ok(
    canTransitionBooking("awaiting_payment", "awaiting_venue_confirmation")
  )
  assert.ok(canTransitionBooking("awaiting_venue_confirmation", "confirmed"))
  assert.ok(
    canTransitionBooking(
      "awaiting_venue_confirmation",
      "rejected_refund_pending"
    )
  )
  assert.ok(canTransitionBooking("rejected_refund_pending", "refunded"))
  // A confirmed booking the venue cancels owes a refund too.
  assert.ok(canTransitionBooking("confirmed", "rejected_refund_pending"))
})

void test("nothing skips the venue's check or the refund proof", () => {
  assert.equal(canTransitionBooking("awaiting_payment", "confirmed"), false)
  assert.equal(
    canTransitionBooking("awaiting_venue_confirmation", "refunded"),
    false
  )
  assert.equal(canTransitionBooking("refunded", "confirmed"), false)
  assert.equal(
    canTransitionBooking("rejected_refund_pending", "confirmed"),
    false
  )
})

void test("only a confirmed booking blocks the slot — unpaid and unverified ones do not", () => {
  const overlaps = (status: BookingRecordStatus) =>
    bookingsOverlap([slot(status)], "c1", "2026-10-20", "18:30", 60)
  assert.equal(overlaps("confirmed"), true)
  assert.equal(overlaps("awaiting_payment"), false)
  assert.equal(overlaps("awaiting_venue_confirmation"), false)
  assert.equal(overlaps("rejected_refund_pending"), false)
  assert.equal(overlaps("refunded"), false)
})
