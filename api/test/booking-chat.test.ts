import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import {
  BookingChatService,
  bookingChatMessage,
  type BookingChatSource,
} from "../src/features/bookings/booking-chat.service.js"
import { StreamService } from "../src/features/stream/stream.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"

const booking: BookingChatSource = {
  bookingId: "b1",
  venueId: "v1",
  userId: "player-1",
  customer: { name: "An", initials: "A" },
  courtName: "Sân 2",
  start: "18:00",
  dateKey: "2026-10-20",
  price: 200_000,
  amountDue: 180_000,
  transferMemo: "SHTABC234",
  paymentProofUrl: "https://res.cloudinary.com/x/proof.png",
  confirmDeadlineAt: "2026-10-20T06:00:00+07:00",
}

void test("the proof message carries the amount, memo, deadline and the screenshot", () => {
  const msg = bookingChatMessage(booking, "proof")
  assert.equal(msg.from, "player")
  assert.match(msg.text, /180\.000₫/)
  assert.match(msg.text, /SHTABC234/)
  assert.match(msg.text, /06:00 20\/10/)
  assert.equal(msg.imageUrl, booking.paymentProofUrl)
})

void test("a rejection speaks for the owner and states the reason", () => {
  const msg = bookingChatMessage(
    { ...booking, rejectReason: "Sân đã có người đặt" },
    "rejected"
  )
  assert.equal(msg.from, "owner")
  assert.match(msg.text, /Sân đã có người đặt/)
})

void test("the refund message shows the amount and the refund screenshot", () => {
  const msg = bookingChatMessage(
    {
      ...booking,
      refund: {
        amount: 180_000,
        pct: 100,
        status: "settled",
      } as BookingChatSource["refund"],
      refundProofUrl: "https://res.cloudinary.com/x/refund.png",
    },
    "refunded"
  )
  assert.match(msg.text, /180\.000₫/)
  assert.equal(msg.imageUrl, "https://res.cloudinary.com/x/refund.png")
})

async function makeChat(opts: { streamFails?: boolean } = {}) {
  const calls: string[] = []
  const stream = {
    ensureBookingChannel: (input: { bookingId: string }) => {
      calls.push(`ensure:${input.bookingId}`)
      if (opts.streamFails) return Promise.reject(new Error("stream down"))
      return Promise.resolve("booking-b1")
    },
    sendBookingMessage: (_id: string, from: string) => {
      calls.push(`send:${from}`)
      return Promise.resolve()
    },
    freezeChannelById: (id: string) => {
      calls.push(`freeze:${id}`)
      return Promise.resolve()
    },
  }
  const venueModel = {
    findOne: () => ({
      select: () => ({
        lean: () =>
          Promise.resolve({ ownerId: "owner-1", brandId: "br1", info: {} }),
      }),
    }),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingChatService,
      { provide: StreamService, useValue: stream },
      { provide: getModelToken(Venue.name), useValue: venueModel },
    ],
  }).compile()
  return { chat: moduleRef.get(BookingChatService), calls }
}

void test("proof opens the channel and the player speaks; approval is the owner's", async () => {
  const { chat, calls } = await makeChat()
  await chat.post(booking, "proof")
  await chat.post(booking, "approved")
  assert.deepEqual(calls, [
    "ensure:b1",
    "send:player-1",
    "ensure:b1",
    "send:owner-1",
  ])
})

void test("a chat outage never throws into the booking flow", async () => {
  const { chat } = await makeChat({ streamFails: true })
  await assert.doesNotReject(() => chat.post(booking, "approved"))
})

void test("the chat freezes once the player confirms the refund arrived", async () => {
  const { chat, calls } = await makeChat()
  await chat.post(booking, "received")
  assert.equal(calls.at(-1), "freeze:booking-b1")
})
