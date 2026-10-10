import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ForbiddenException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { SEPAY_CLIENT } from "../src/features/payments/sepay.client.js"
import { TopUp } from "../src/features/payments/topup.schema.js"
import { TopUpsService } from "../src/features/payments/topups.service.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"

interface FakeTopUp {
  invoiceNumber: string
  userId: string
  amount: number
  status: "awaiting" | "paid" | "cancelled"
  paidAt?: string
}

async function makeService(remoteStatus = "PENDING") {
  const store = new Map<string, FakeTopUp>()
  const credits: { userId: string; amount: number; txId: string }[] = []
  const seen = new Set<string>()
  const notifications: string[] = []
  const topUpModel = {
    create: (doc: FakeTopUp) => {
      store.set(doc.invoiceNumber, { ...doc })
      return Promise.resolve(store.get(doc.invoiceNumber))
    },
    findOne: (f: { invoiceNumber: string }) =>
      Promise.resolve(store.get(f.invoiceNumber) ?? null),
    findOneAndUpdate: (
      f: { invoiceNumber: string; status: string; amount?: number },
      update: { $set: Partial<FakeTopUp> }
    ) => {
      const doc = store.get(f.invoiceNumber)
      if (
        !doc ||
        doc.status !== f.status ||
        (f.amount !== undefined && doc.amount !== f.amount)
      ) {
        return Promise.resolve(null)
      }
      Object.assign(doc, update.$set)
      return Promise.resolve(doc)
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      TopUpsService,
      { provide: getModelToken(TopUp.name), useValue: topUpModel },
      {
        provide: SEPAY_CLIENT,
        useValue: {
          initCheckout: (i: { invoiceNumber: string; successUrl: string }) => ({
            fields: { order_invoice_number: i.invoiceNumber, ok: i.successUrl },
            checkoutUrl: "https://sandbox.pay.sepay.vn/v1/init",
          }),
          retrieveOrder: () => Promise.resolve({ order_status: remoteStatus }),
        },
      },
      {
        provide: WalletService,
        useValue: {
          credit: (userId: string, amount: number, m: { txId: string }) => {
            const applied = !seen.has(m.txId)
            seen.add(m.txId)
            if (applied) credits.push({ userId, amount, txId: m.txId })
            return Promise.resolve({ balance: amount, applied })
          },
        },
      },
      {
        provide: NotificationsService,
        useValue: {
          create: (_u: string, item: { id: string }) => {
            notifications.push(item.id)
            return Promise.resolve()
          },
        },
      },
      {
        provide: ConfigService,
        useValue: { getOrThrow: () => "http://localhost:3000/vi/app/payment" },
      },
    ],
  }).compile()
  return {
    service: moduleRef.get(TopUpsService),
    store,
    credits,
    notifications,
  }
}

void test("create opens an awaiting TU- order that returns to the wallet page", async () => {
  const { service, store } = await makeService()

  const res = await service.create("user-1", 100_000)

  assert.match(res.topUp.id, /^TU-/)
  assert.equal(res.topUp.status, "awaiting")
  assert.equal(store.get(res.topUp.id)?.amount, 100_000)
  assert.equal(
    res.fields.ok,
    `http://localhost:3000/vi/app/wallet?topup=${res.topUp.id}`
  )
})

void test("settle credits the wallet once, however often the IPN is replayed", async () => {
  const { service, credits, notifications } = await makeService()
  const { topUp } = await service.create("user-1", 100_000)

  await service.settle(topUp.id, {}, 100_000)
  const replay = await service.settle(topUp.id, {}, 100_000)

  assert.equal(replay, null)
  assert.deepEqual(credits, [
    { userId: "user-1", amount: 100_000, txId: `topup-${topUp.id}` },
  ])
  assert.equal(notifications.length, 1)
})

void test("settle ignores a short-settled order (amount mismatch)", async () => {
  const { service, credits, store } = await makeService()
  const { topUp } = await service.create("user-1", 100_000)

  const res = await service.settle(topUp.id, {}, 50_000)

  assert.equal(res, null)
  assert.deepEqual(credits, [])
  assert.equal(store.get(topUp.id)?.status, "awaiting")
})

void test("byId reconciles a paid SePay order whose IPN never arrived", async () => {
  const { service, credits } = await makeService("CAPTURED")
  const { topUp } = await service.create("user-1", 100_000)

  const polled = await service.byId("user-1", topUp.id)

  assert.equal(polled.status, "paid")
  assert.equal(credits.length, 1)
})

void test("byId refuses another player's top-up", async () => {
  const { service } = await makeService()
  const { topUp } = await service.create("user-1", 100_000)

  await assert.rejects(
    () => service.byId("user-2", topUp.id),
    ForbiddenException
  )
})
