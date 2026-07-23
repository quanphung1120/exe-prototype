import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { Payment } from "../src/features/payments/payment.schema.js"
import { PaymentsService } from "../src/features/payments/payments.service.js"
import {
  SEPAY_CLIENT,
  type SepayClientPort,
} from "../src/features/payments/sepay.client.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { DiscountsService } from "../src/features/discounts/discounts.service.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"

/**
 * Service-level tests for the Phase 4 SePay checkout/IPN feature
 * (`PaymentsController` → `PaymentsService`). `SEPAY_CLIENT` is always a hand-
 * rolled fake bound in `makeService` below — never the real `sepay-pg-node`-
 * backed `SepayClient` — so none of these tests can ever reach the network,
 * sandbox or otherwise.
 */

// ── Chainable query mock (mirrors bookings-service.test.ts's makeQuery) ─────

function makeQuery<T>(result: T) {
  const q = {
    select: () => q,
    sort: () => q,
    session: () => q,
    lean: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return q
}

// ── Fake `payments` collection ───────────────────────────────────────────────

interface FakePaymentDoc {
  invoiceNumber: string
  bookingId: string
  venueId: string
  userId?: string
  amount: number
  currency: string
  status: "awaiting" | "paid" | "cancelled"
  checkoutUrl?: string
  paidAt?: string
  originalAmount?: number
  discountCode?: string
  discountAmount?: number
  ipnPayload?: unknown
  save: () => Promise<void>
}

function matches(
  doc: Record<string, unknown>,
  filter: Record<string, unknown>
) {
  return Object.entries(filter).every(([k, v]) => doc[k] === v)
}

/**
 * A minimal stand-in for the `Payment` Mongoose model — a `Map` keyed by
 * `bookingId` playing the collection, with just enough of `findOne`/
 * `findOneAndUpdate`'s real semantics (exact-match filters, `$set`/
 * `$setOnInsert`, `upsert`) for `PaymentsService`'s exact call shapes.
 */
function makeFakePaymentModel(store: Map<string, FakePaymentDoc>) {
  function find(filter: Record<string, unknown>): FakePaymentDoc | undefined {
    for (const doc of store.values()) {
      if (matches(doc as unknown as Record<string, unknown>, filter)) return doc
    }
    return undefined
  }
  return {
    findOne: (filter: Record<string, unknown>) =>
      makeQuery(find(filter) ?? null),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: {
        $set?: Record<string, unknown>
        $setOnInsert?: Record<string, unknown>
      },
      options: { upsert?: boolean; new?: boolean } = {}
    ) => {
      let doc = find(filter)
      if (!doc) {
        if (!options.upsert) return Promise.resolve(null)
        doc = {
          ...(update.$setOnInsert as unknown as FakePaymentDoc),
          save: () => Promise.resolve(),
        }
        store.set(doc.bookingId, doc)
      } else if (update.$set) {
        Object.assign(doc, update.$set)
      }
      return Promise.resolve(doc)
    },
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBookingLean(overrides: Record<string, unknown> = {}) {
  return {
    venueId: "v9",
    userId: "user-1",
    status: "awaiting_payment",
    price: 200_000,
    courtName: "Sân 1",
    ...overrides,
  }
}

interface Deps {
  bookingLean?: ReturnType<typeof makeBookingLean>
  venueOwnerId?: string | null
  confirmPaymentResult?: {
    bookingId: string
    venueId: string
    status?: string
  } | null
  remoteOrder?: { order_status?: string }
  validSignature?: boolean
  seedPayments?: FakePaymentDoc[]
  /** Stubs `DiscountsService#validate` — throw to simulate an invalid code. */
  discountValidate?: (
    code: string,
    amount: number
  ) => {
    valid: true
    code: string
    type: "percent" | "fixed"
    value: number
    description: string
    discountAmount: number
    finalAmount: number
  }
}

function makeService(deps: Deps = {}) {
  const store = new Map<string, FakePaymentDoc>(
    (deps.seedPayments ?? []).map((p) => [p.bookingId, p])
  )
  const bookingLean = deps.bookingLean ?? makeBookingLean()
  const notifications: { userId: string; item: unknown }[] = []
  const cancelCalls: string[] = []
  const confirmPaymentCalls: string[] = []

  const paymentModelMock = makeFakePaymentModel(store)
  const bookingModelMock = { findOne: () => makeQuery(bookingLean) }
  const venueModelMock = {
    findOne: () =>
      makeQuery(
        deps.venueOwnerId === null
          ? { ownerId: undefined }
          : { ownerId: deps.venueOwnerId ?? "owner-1" }
      ),
  }
  const sepayMock: SepayClientPort = {
    initCheckout: (input) => ({
      fields: { order_invoice_number: input.invoiceNumber, signature: "sig" },
      checkoutUrl: "https://sandbox.pay.sepay.vn/v1/init",
    }),
    retrieveOrder: () =>
      Promise.resolve(deps.remoteOrder ?? { order_status: "PENDING" }),
    cancelOrder: (invoiceNumber) => {
      cancelCalls.push(invoiceNumber)
      return Promise.resolve()
    },
    verifyIpnSignature: () => deps.validSignature ?? true,
  }
  const bookingsServiceMock = {
    confirmPayment: (bookingId: string) => {
      confirmPaymentCalls.push(bookingId)
      // A real `confirmPayment` returns the booking doc it moved to `pending`;
      // `markPaid` only notifies the venue when the booking actually reached
      // that approvable state (a payment landing after expiry is refunded, not
      // approvable), so the fake returns a `pending` status by default.
      return Promise.resolve(
        deps.confirmPaymentResult ?? {
          bookingId,
          venueId: "v9",
          status: "pending",
        }
      )
    },
  }
  const notificationsMock = {
    create: (userId: string, item: unknown) => {
      notifications.push({ userId, item })
      return Promise.resolve()
    },
  }
  const configMock = {
    getOrThrow: () => "http://localhost:3000/dashboard/bookings",
  }
  const applyUsageCalls: string[] = []
  const discountsMock = {
    validate: (code: string, amount: number) => {
      if (deps.discountValidate) {
        return Promise.resolve(deps.discountValidate(code, amount))
      }
      return Promise.reject(new Error(`no discountValidate stub for ${code}`))
    },
    applyUsage: (code: string) => {
      applyUsageCalls.push(code)
      return Promise.resolve()
    },
  }

  return Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: getModelToken(Payment.name), useValue: paymentModelMock },
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(Venue.name), useValue: venueModelMock },
      { provide: SEPAY_CLIENT, useValue: sepayMock },
      { provide: BookingsService, useValue: bookingsServiceMock },
      { provide: NotificationsService, useValue: notificationsMock },
      { provide: DiscountsService, useValue: discountsMock },
      { provide: ConfigService, useValue: configMock },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(PaymentsService),
      store,
      notifications,
      cancelCalls,
      confirmPaymentCalls,
      applyUsageCalls,
    }))
}

function ipnBody(
  invoiceNumber: string,
  notificationType = "ORDER_PAID",
  orderAmount?: number
) {
  return JSON.stringify({
    timestamp: Math.floor(Date.now() / 1000),
    notification_type: notificationType,
    order: {
      order_invoice_number: invoiceNumber,
      order_status: "PAID",
      ...(orderAmount === undefined ? {} : { order_amount: orderAmount }),
    },
  })
}

// ── checkout ─────────────────────────────────────────────────────────────────

void test("checkout opens a new awaiting payment for the caller's own hold", async () => {
  const { service, store } = await makeService()
  const result = await service.checkout("user-1", "b1")

  assert.equal(result.payment.status, "awaiting")
  assert.equal(result.payment.invoiceNumber, "b1")
  assert.equal(result.payment.amount, 200_000)
  assert.equal(result.checkoutUrl, "https://sandbox.pay.sepay.vn/v1/init")
  assert.equal(result.fields.order_invoice_number, "b1")
  assert.equal(store.size, 1)
})

void test("checkout re-POST reuses the same invoice instead of opening a second order", async () => {
  const { service, store } = await makeService()
  await service.checkout("user-1", "b1")
  await service.checkout("user-1", "b1")

  assert.equal(store.size, 1)
})

void test("checkout rejects a caller who doesn't own the booking", async () => {
  const { service } = await makeService({
    bookingLean: makeBookingLean({ userId: "someone-else" }),
  })
  await assert.rejects(
    () => service.checkout("user-1", "b1"),
    ForbiddenException
  )
})

void test("checkout rejects a booking that isn't awaiting payment", async () => {
  const { service } = await makeService({
    bookingLean: makeBookingLean({ status: "confirmed" }),
  })
  await assert.rejects(
    () => service.checkout("user-1", "b1"),
    ConflictException
  )
})

void test("checkout rejects re-checkout once the booking is already paid", async () => {
  const { service } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "paid",
        save: () => Promise.resolve(),
      },
    ],
  })
  await assert.rejects(
    () => service.checkout("user-1", "b1"),
    ConflictException
  )
})

void test("checkout with a valid discountCode charges the discounted amount and persists it", async () => {
  const { service, store } = await makeService({
    discountValidate: (code, amount) => ({
      valid: true,
      code,
      type: "percent",
      value: 10,
      description: "Giảm 10%",
      discountAmount: 20_000,
      finalAmount: amount - 20_000,
    }),
  })
  const result = await service.checkout("user-1", "b1", "giam10")

  assert.equal(result.payment.amount, 180_000)
  assert.equal(result.payment.originalAmount, 200_000)
  assert.equal(result.payment.discountCode, "giam10")
  assert.equal(result.payment.discountAmount, 20_000)
  assert.equal(store.get("b1")?.amount, 180_000)
})

void test("checkout re-throws when the discountCode fails validation instead of silently ignoring it", async () => {
  const { service } = await makeService({
    discountValidate: () => {
      throw new ConflictException("Mã giảm giá đã hết hạn")
    },
  })
  await assert.rejects(() => service.checkout("user-1", "b1", "hethan"))
})

// ── IPN ──────────────────────────────────────────────────────────────────────

void test("handleIpn marks the payment paid, confirms the booking, and notifies the venue", async () => {
  const { service, store, notifications, confirmPaymentCalls } =
    await makeService({
      seedPayments: [
        {
          invoiceNumber: "b1",
          bookingId: "b1",
          venueId: "v9",
          userId: "user-1",
          amount: 200_000,
          currency: "VND",
          status: "awaiting",
          save: () => Promise.resolve(),
        },
      ],
    })

  const result = await service.handleIpn(Buffer.from(ipnBody("b1")), {
    "x-sepay-signature": "sha256=irrelevant-in-this-fake",
    "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
  })

  assert.deepEqual(result, { received: true })
  assert.equal(store.get("b1")?.status, "paid")
  assert.ok(store.get("b1")?.paidAt)
  assert.deepEqual(confirmPaymentCalls, ["b1"])
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.userId, "owner-1")
})

void test("handleIpn increments the discount's usedCount only once the payment settles", async () => {
  const { service, store, applyUsageCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 180_000,
        currency: "VND",
        status: "awaiting",
        originalAmount: 200_000,
        discountCode: "GIAM10",
        discountAmount: 20_000,
        save: () => Promise.resolve(),
      },
    ],
  })

  await service.handleIpn(Buffer.from(ipnBody("b1")), {
    "x-sepay-signature": "sha256=irrelevant-in-this-fake",
    "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
  })

  assert.equal(store.get("b1")?.status, "paid")
  assert.deepEqual(applyUsageCalls, ["GIAM10"])
})

void test("handleIpn rejects an invalid signature and touches nothing", async () => {
  const { service, store, notifications } = await makeService({
    validSignature: false,
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  await assert.rejects(
    () =>
      service.handleIpn(Buffer.from(ipnBody("b1")), {
        "x-sepay-signature": "sha256=bad",
        "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
      }),
    UnauthorizedException
  )
  assert.equal(store.get("b1")?.status, "awaiting")
  assert.equal(notifications.length, 0)
})

void test("handleIpn is a no-op replay once the invoice is already paid", async () => {
  const { service, notifications, confirmPaymentCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "paid",
        paidAt: "2026-07-20T10:00:00+07:00",
        save: () => Promise.resolve(),
      },
    ],
  })

  const result = await service.handleIpn(Buffer.from(ipnBody("b1")), {
    "x-sepay-signature": "sha256=irrelevant-in-this-fake",
    "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
  })

  assert.deepEqual(result, { received: true })
  assert.equal(confirmPaymentCalls.length, 0)
  assert.equal(notifications.length, 0)
})

void test("handleIpn ignores a non-ORDER_PAID notification", async () => {
  const { service, store, confirmPaymentCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  await service.handleIpn(Buffer.from(ipnBody("b1", "TRANSACTION_VOID")), {
    "x-sepay-signature": "sha256=irrelevant-in-this-fake",
    "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
  })

  assert.equal(store.get("b1")?.status, "awaiting")
  assert.equal(confirmPaymentCalls.length, 0)
})

/**
 * `PaymentsService`'s `logger` is a plain `Logger` instance, not injected —
 * spy on the shared prototype method for the duration of `fn` and restore it
 * after, mirroring how one would spy on any un-injectable singleton.
 */
async function captureLoggerErrors(fn: () => Promise<void>) {
  const calls: unknown[][] = []
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below, never invoked unbound.
  const original = Logger.prototype.error
  Logger.prototype.error = ((...args: unknown[]) => {
    calls.push(args)
  }) as typeof Logger.prototype.error
  try {
    await fn()
  } finally {
    Logger.prototype.error = original
  }
  return calls
}

void test("handleIpn does not settle a payment whose order_amount is short of the recorded amount, but still acks and logs an error", async () => {
  const { service, store, notifications, confirmPaymentCalls } =
    await makeService({
      seedPayments: [
        {
          invoiceNumber: "b1",
          bookingId: "b1",
          venueId: "v9",
          userId: "user-1",
          amount: 200_000,
          currency: "VND",
          status: "awaiting",
          save: () => Promise.resolve(),
        },
      ],
    })

  let result: { received: boolean } | undefined
  const errorLogs = await captureLoggerErrors(async () => {
    result = await service.handleIpn(
      Buffer.from(ipnBody("b1", "ORDER_PAID", 150_000)),
      {
        "x-sepay-signature": "sha256=irrelevant-in-this-fake",
        "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
      }
    )
  })

  assert.deepEqual(result, { received: true })
  assert.equal(store.get("b1")?.status, "awaiting")
  assert.equal(confirmPaymentCalls.length, 0)
  assert.equal(notifications.length, 0)
  assert.equal(errorLogs.length, 1)
  const [message] = errorLogs[0] ?? []
  assert.match(String(message), /b1/)
  assert.match(String(message), /200000|200,000|200_000/)
  assert.match(String(message), /150000|150,000|150_000/)
})

void test("handleIpn settles the payment when order_amount matches the recorded amount", async () => {
  const { service, store, confirmPaymentCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  const errorLogs = await captureLoggerErrors(async () => {
    const result = await service.handleIpn(
      Buffer.from(ipnBody("b1", "ORDER_PAID", 200_000)),
      {
        "x-sepay-signature": "sha256=irrelevant-in-this-fake",
        "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
      }
    )
    assert.deepEqual(result, { received: true })
  })

  assert.equal(store.get("b1")?.status, "paid")
  assert.deepEqual(confirmPaymentCalls, ["b1"])
  assert.equal(errorLogs.length, 0)
})

// ── byBooking ────────────────────────────────────────────────────────────────

void test("byBooking reconciles an awaiting payment SePay already marked paid", async () => {
  const { service, store, confirmPaymentCalls } = await makeService({
    remoteOrder: { order_status: "PAID" },
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  const result = await service.byBooking("user-1", "b1")

  assert.equal(result.status, "paid")
  assert.equal(store.get("b1")?.status, "paid")
  assert.deepEqual(confirmPaymentCalls, ["b1"])
})

void test("byBooking leaves an awaiting payment alone when SePay still shows it pending", async () => {
  const { service, store } = await makeService({
    remoteOrder: { order_status: "PENDING" },
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  const result = await service.byBooking("user-1", "b1")
  assert.equal(result.status, "awaiting")
  assert.equal(store.get("b1")?.status, "awaiting")
})

void test("byBooking rejects a caller who doesn't own the payment", async () => {
  const { service } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "paid",
        save: () => Promise.resolve(),
      },
    ],
  })
  await assert.rejects(
    () => service.byBooking("someone-else", "b1"),
    ForbiddenException
  )
})

// ── Phase 5 seam ─────────────────────────────────────────────────────────────

void test("cancelOrderForBooking cancels an open order and marks the payment cancelled", async () => {
  const { service, store, cancelCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "awaiting",
        save: () => Promise.resolve(),
      },
    ],
  })

  await service.cancelOrderForBooking("b1")

  assert.deepEqual(cancelCalls, ["b1"])
  assert.equal(store.get("b1")?.status, "cancelled")
})

void test("cancelOrderForBooking no-ops when the payment is already settled", async () => {
  const { service, cancelCalls } = await makeService({
    seedPayments: [
      {
        invoiceNumber: "b1",
        bookingId: "b1",
        venueId: "v9",
        userId: "user-1",
        amount: 200_000,
        currency: "VND",
        status: "paid",
        save: () => Promise.resolve(),
      },
    ],
  })

  await service.cancelOrderForBooking("b1")
  assert.equal(cancelCalls.length, 0)
})

void test("cancelOrderForBooking no-ops when checkout was never started", async () => {
  const { service, cancelCalls } = await makeService()
  await service.cancelOrderForBooking("never-checked-out")
  assert.equal(cancelCalls.length, 0)
})
