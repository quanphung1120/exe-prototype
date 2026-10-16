import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { PayoutService } from "../src/features/brands/payout.service.js"
import { DiscountsService } from "../src/features/discounts/discounts.service.js"
import { PaymentsService } from "../src/features/payments/payments.service.js"
import { ProofUploadService } from "../src/features/payments/proof-upload.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import type { BankAccount } from "../src/shared/index.js"

/**
 * The player's side of a VietQR payment: show where to transfer (a QR and a
 * unique memo), sign the screenshot upload, record the proof. The Mongoose
 * model and the collaborating services are faked; nothing touches a database
 * or the network.
 */

const VENUE_ACCOUNT: BankAccount = {
  bankBin: "970422",
  bankCode: "MB",
  bankName: "MBBank",
  accountNo: "0123456789",
  accountName: "SAN CAU LONG ABC",
}
const REFUND_ACCOUNT: BankAccount = {
  bankBin: "970415",
  bankCode: "ICB",
  bankName: "VietinBank",
  accountNo: "9988776655",
  accountName: "NGUYEN VAN A",
}
const CLOUD = "demo"
const proofUrl = (venueId = "v9") =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/v1/shuttio/payment-proofs/${venueId}/p.png`

interface FakeBooking {
  venueId: string
  userId?: string
  status: string
  price: number
  amountDue?: number
  transferMemo?: string
  payoutSnapshot?: BankAccount
  discountCode?: string
  discountAmount?: number
  originalAmount?: number
}

const makeBooking = (over: Partial<FakeBooking> = {}): FakeBooking => ({
  venueId: "v9",
  userId: "user-1",
  status: "awaiting_payment",
  price: 200_000,
  ...over,
})

function makeQuery<T>(result: T) {
  const q = {
    select: () => q,
    lean: () => Promise.resolve(result),
  }
  return q
}

interface Deps {
  booking?: FakeBooking | null
  payout?: BankAccount | null
  discount?: {
    code: string
    discountAmount: number
    finalAmount: number
    usageLimit?: number
    perUserLimit?: number
  }
  /** Redemptions `countDocuments` reports (per-user filter has `userId`). */
  redeemedByUser?: number
  redeemedTotal?: number
  /** Make the first N `findOneAndUpdate` calls fail with a duplicate memo. */
  duplicateMemos?: number
}

async function makeService(deps: Deps = {}) {
  const booking = deps.booking === undefined ? makeBooking() : deps.booking
  const updates: {
    filter: unknown
    update: { $set: Record<string, unknown> }
  }[] = []
  const submitted: unknown[] = []
  const refunds: unknown[] = []
  const savedRefundAccounts: BankAccount[] = []
  const usages: string[] = []
  let duplicates = deps.duplicateMemos ?? 0

  const bookingModel = {
    findOne: () => makeQuery(booking),
    countDocuments: (filter: { userId?: string }) =>
      Promise.resolve(
        filter.userId !== undefined
          ? (deps.redeemedByUser ?? 0)
          : (deps.redeemedTotal ?? 0)
      ),
    findOneAndUpdate: (
      filter: unknown,
      update: { $set: Record<string, unknown> }
    ) => {
      if (duplicates > 0) {
        duplicates--
        return {
          lean: () =>
            Promise.reject(Object.assign(new Error("dup"), { code: 11000 })),
        }
      }
      updates.push({ filter, update })
      if (booking) Object.assign(booking, update.$set)
      return makeQuery(booking)
    },
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      PaymentsService,
      ProofUploadService,
      { provide: getModelToken(Booking.name), useValue: bookingModel },
      {
        provide: BookingsService,
        useValue: {
          submitPaymentProof: (...args: unknown[]) => {
            submitted.push(args)
            return Promise.resolve({ status: "awaiting_venue_confirmation" })
          },
          assertOwnsBookingVenue: (caller: string) =>
            caller === "owner-1"
              ? Promise.resolve("v9")
              : Promise.reject(new ForbiddenException("not yours")),
          completeRefund: (...args: unknown[]) => {
            refunds.push(args)
            return Promise.resolve({ status: "refunded" })
          },
        },
      },
      {
        provide: PayoutService,
        useValue: {
          payoutForVenue: () =>
            Promise.resolve(
              deps.payout === undefined ? VENUE_ACCOUNT : deps.payout
            ),
          toAccount: () => Promise.resolve(REFUND_ACCOUNT),
        },
      },
      {
        provide: DiscountsService,
        useValue: {
          validate: () =>
            deps.discount
              ? Promise.resolve(deps.discount)
              : Promise.reject(
                  new NotFoundException("Mã giảm giá không tồn tại")
                ),
          applyUsage: (code: string) => {
            usages.push(code)
            return Promise.resolve("applied")
          },
        },
      },
      {
        provide: ProfileService,
        useValue: {
          getRefundAccount: () => Promise.resolve(null),
          setRefundAccount: (_u: string, account: BankAccount) => {
            savedRefundAccounts.push(account)
            return Promise.resolve()
          },
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            ({
              CLOUDINARY_CLOUD_NAME: CLOUD,
              CLOUDINARY_API_KEY: "key",
              CLOUDINARY_API_SECRET: "secret",
            })[key],
        },
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(PaymentsService),
    updates,
    submitted,
    refunds,
    savedRefundAccounts,
    usages,
  }
}

// ── startPayment ─────────────────────────────────────────────────────────────

void test("startPayment fixes the amount, a unique memo and the venue's account, and returns a QR", async () => {
  const { service, updates } = await makeService()

  const start = await service.startPayment("user-1", "b1")

  assert.equal(start.amount, 200_000)
  assert.match(start.transferMemo, /^SHT[A-Z2-9]{6}$/)
  assert.deepEqual(start.account, VENUE_ACCOUNT)
  assert.ok(
    start.qrUrl.startsWith(
      "https://img.vietqr.io/image/970422-0123456789-compact2.png?"
    )
  )
  assert.ok(start.qrUrl.includes("amount=200000"))
  assert.ok(start.qrUrl.includes(`addInfo=${start.transferMemo}`))
  assert.equal(updates.length, 1)
  assert.equal(updates[0]?.update.$set.paymentMethod, "vietqr")
})

void test("startPayment resumes with the same memo, amount and account instead of creating new ones", async () => {
  const { service, updates } = await makeService({
    booking: makeBooking({
      transferMemo: "SHTABC234",
      amountDue: 150_000,
      payoutSnapshot: VENUE_ACCOUNT,
    }),
    // The venue changed its account since — the snapshot must win.
    payout: { ...VENUE_ACCOUNT, accountNo: "1111111111" },
  })

  const start = await service.startPayment("user-1", "b1")

  assert.equal(start.transferMemo, "SHTABC234")
  assert.equal(start.amount, 150_000)
  assert.equal(start.account.accountNo, "0123456789")
  assert.equal(updates.length, 0)
})

void test("startPayment charges the discounted amount and remembers the code", async () => {
  const { service, updates } = await makeService({
    discount: { code: "GIAM10", discountAmount: 20_000, finalAmount: 180_000 },
  })

  const start = await service.startPayment("user-1", "b1", "giam10")

  assert.equal(start.amount, 180_000)
  assert.equal(start.originalAmount, 200_000)
  assert.equal(start.discountCode, "GIAM10")
  assert.equal(updates[0]?.update.$set.amountDue, 180_000)
})

void test("startPayment enforces a discount code's per-user and total caps", async () => {
  const perUser = await makeService({
    discount: {
      code: "ONCE",
      discountAmount: 1,
      finalAmount: 199_999,
      perUserLimit: 1,
    },
    redeemedByUser: 1,
  })
  await assert.rejects(
    () => perUser.service.startPayment("user-1", "b1", "ONCE"),
    /tối đa số lần/
  )
  const total = await makeService({
    discount: {
      code: "FIRST",
      discountAmount: 1,
      finalAmount: 199_999,
      usageLimit: 10,
    },
    redeemedTotal: 10,
  })
  await assert.rejects(
    () => total.service.startPayment("user-1", "b1", "FIRST"),
    /hết lượt/
  )
})

void test("startPayment retries when a generated memo is already taken", async () => {
  const { service, updates } = await makeService({ duplicateMemos: 2 })
  const start = await service.startPayment("user-1", "b1")
  assert.match(start.transferMemo, /^SHT/)
  assert.equal(updates.length, 1)
})

void test("startPayment refuses a venue with no account, another player's booking and a wrong status", async () => {
  const noAccount = await makeService({ payout: null })
  await assert.rejects(
    () => noAccount.service.startPayment("user-1", "b1"),
    ConflictException
  )
  const stranger = await makeService({ booking: makeBooking({ userId: "x" }) })
  await assert.rejects(
    () => stranger.service.startPayment("user-1", "b1"),
    ForbiddenException
  )
  const confirmed = await makeService({
    booking: makeBooking({ status: "confirmed" }),
  })
  await assert.rejects(
    () => confirmed.service.startPayment("user-1", "b1"),
    ConflictException
  )
  const missing = await makeService({ booking: null })
  await assert.rejects(
    () => missing.service.startPayment("user-1", "b1"),
    NotFoundException
  )
})

// ── proof upload ─────────────────────────────────────────────────────────────

void test("signProofUpload signs into the venue's proof folder, only while unpaid", async () => {
  const { service } = await makeService()
  const sig = await service.signProofUpload("user-1", "b1")
  assert.equal(sig.folder, "shuttio/payment-proofs/v9")
  assert.equal(sig.cloudName, CLOUD)
  assert.ok(sig.signature)

  const done = await makeService({
    booking: makeBooking({ status: "awaiting_venue_confirmation" }),
  })
  await assert.rejects(
    () => done.service.signProofUpload("user-1", "b1"),
    ConflictException
  )
})

void test("submitProof accepts the venue's own screenshot, saves the refund account and records the discount use", async () => {
  const { service, submitted, savedRefundAccounts, usages } = await makeService(
    {
      booking: makeBooking({ discountCode: "GIAM10" }),
    }
  )

  await service.submitProof("user-1", "b1", {
    proofUrl: proofUrl(),
    refundAccount: { bankBin: "970415", accountNo: "x", accountName: "y" },
  })

  assert.equal(submitted.length, 1)
  assert.deepEqual((submitted[0] as unknown[])[2], {
    proofUrl: proofUrl(),
    refundAccount: REFUND_ACCOUNT,
  })
  assert.deepEqual(savedRefundAccounts, [REFUND_ACCOUNT])
  assert.deepEqual(usages, ["GIAM10"])
})

void test("submitProof rejects a URL that isn't this venue's own upload", async () => {
  const { service, submitted } = await makeService()
  const refundAccount = { bankBin: "970415", accountNo: "x", accountName: "y" }
  for (const bad of [
    "https://evil.example/shuttio/payment-proofs/v9/p.png",
    proofUrl("another-venue"),
    `https://res.cloudinary.com/${CLOUD}/image/upload/v1/shuttio/venues/v9/p.png`,
    `${proofUrl()}?x=1`,
  ]) {
    await assert.rejects(
      () =>
        service.submitProof("user-1", "b1", { proofUrl: bad, refundAccount }),
      BadRequestException
    )
  }
  assert.equal(submitted.length, 0)
})

// ── venue refund proof ───────────────────────────────────────────────────────

void test("the venue signs and completes a refund with its own screenshot only", async () => {
  const { service, refunds } = await makeService()

  const sig = await service.signRefundUpload("owner-1", "b1")
  assert.equal(sig.folder, "shuttio/payment-proofs/v9")

  await service.completeRefund("owner-1", "b1", {
    proofUrl: proofUrl(),
    amount: 90_000,
  })
  assert.equal(refunds.length, 1)

  await assert.rejects(
    () => service.completeRefund("owner-1", "b1", { proofUrl: proofUrl("x") }),
    BadRequestException
  )
  await assert.rejects(
    () => service.completeRefund("stranger", "b1", { proofUrl: proofUrl() }),
    ForbiddenException
  )
})
