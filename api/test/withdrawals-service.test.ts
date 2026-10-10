import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"
import { Withdrawal } from "../src/features/wallet/withdrawal.schema.js"
import { WithdrawalsService } from "../src/features/wallet/withdrawals.service.js"

interface FakeWithdrawal {
  withdrawalId: string
  userId: string
  amount: number
  bankName: string
  accountNumber: string
  accountHolder: string
  status: "pending" | "completed" | "rejected"
  ref?: string
  adminNote?: string
  requestedAt: string
  resolvedAt?: string
  save: () => Promise<void>
}

async function makeService(
  opts: {
    brokeUsers?: string[]
    seed?: FakeWithdrawal[]
    createFails?: boolean
  } = {}
) {
  const store: FakeWithdrawal[] = [...(opts.seed ?? [])]
  const wallet: { op: string; userId: string; amount: number; txId: string }[] =
    []
  const notifications: { userId: string; text: string }[] = []
  const model = {
    countDocuments: (f: { userId: string; status: string }) =>
      Promise.resolve(
        store.filter((w) => w.userId === f.userId && w.status === f.status)
          .length
      ),
    create: (doc: Omit<FakeWithdrawal, "save">) => {
      if (opts.createFails) return Promise.reject(new Error("db down"))
      const row = { ...doc, save: () => Promise.resolve() }
      store.push(row)
      return Promise.resolve(row)
    },
    findOne: (f: { withdrawalId: string }) =>
      Promise.resolve(
        store.find((w) => w.withdrawalId === f.withdrawalId) ?? null
      ),
    find: (f: { userId?: string } = {}) => {
      const hits = store.filter((w) => !f.userId || w.userId === f.userId)
      const chain = {
        sort: () => chain,
        limit: () => chain,
        lean: () => Promise.resolve(hits),
      }
      return chain
    },
  }
  const walletMock = {
    debit: (userId: string, amount: number, m: { txId: string }) => {
      if (opts.brokeUsers?.includes(userId)) {
        return Promise.reject(new HttpException("Số dư ví không đủ", 402))
      }
      wallet.push({ op: "debit", userId, amount, txId: m.txId })
      return Promise.resolve({ balance: 0, applied: true })
    },
    credit: (userId: string, amount: number, m: { txId: string }) => {
      wallet.push({ op: "credit", userId, amount, txId: m.txId })
      return Promise.resolve({ balance: amount, applied: true })
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      WithdrawalsService,
      { provide: getModelToken(Withdrawal.name), useValue: model },
      { provide: WalletService, useValue: walletMock },
      {
        provide: NotificationsService,
        useValue: {
          create: (userId: string, i: { text: string }) => {
            notifications.push({ userId, text: i.text })
            return Promise.resolve()
          },
        },
      },
    ],
  }).compile()
  return {
    service: moduleRef.get(WithdrawalsService),
    store,
    wallet,
    notifications,
  }
}

const dto = {
  amount: 200_000,
  bankName: "Vietcombank",
  accountNumber: "0123456789",
  accountHolder: "NGUYEN VAN A",
}

function pending(overrides: Partial<FakeWithdrawal> = {}): FakeWithdrawal {
  return {
    withdrawalId: "w1",
    userId: "u1",
    amount: 200_000,
    bankName: "Vietcombank",
    accountNumber: "0123456789",
    accountHolder: "NGUYEN VAN A",
    status: "pending",
    requestedAt: "2026-10-09T10:00:00+07:00",
    save: () => Promise.resolve(),
    ...overrides,
  }
}

void test("requesting a withdrawal takes the money out of the wallet at once", async () => {
  const { service, store, wallet } = await makeService()

  const row = await service.create("u1", dto)

  assert.equal(row.status, "pending")
  assert.equal(row.amount, 200_000)
  assert.equal(store.length, 1)
  assert.equal(wallet.length, 1)
  assert.equal(wallet[0]?.op, "debit")
  assert.equal(wallet[0]?.amount, 200_000)
  assert.equal(wallet[0]?.txId, `withdraw-${row.id}`)
})

void test("a withdrawal beyond the balance fails 402 and records nothing", async () => {
  const { service, store } = await makeService({ brokeUsers: ["u1"] })

  await assert.rejects(
    () => service.create("u1", dto),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 402
  )
  assert.equal(store.length, 0)
})

void test("no more than 3 withdrawals may wait for a transfer", async () => {
  const { service, wallet } = await makeService({
    seed: [
      pending({ withdrawalId: "a" }),
      pending({ withdrawalId: "b" }),
      pending({ withdrawalId: "c" }),
    ],
  })

  await assert.rejects(() => service.create("u1", dto), ConflictException)
  assert.deepEqual(wallet, [])
})

void test("if the request can't be saved the debited money goes straight back", async () => {
  const { service, wallet } = await makeService({ createFails: true })

  await assert.rejects(() => service.create("u1", dto), /db down/)

  assert.deepEqual(
    wallet.map((w) => [w.op, w.amount]),
    [
      ["debit", 200_000],
      ["credit", 200_000],
    ]
  )
})

void test("completing records the transfer reference and tells the player", async () => {
  const { service, store, notifications } = await makeService({
    seed: [pending()],
  })

  const row = await service.complete("w1", "FT2610090001")

  assert.equal(row.status, "completed")
  assert.equal(row.ref, "FT2610090001")
  assert.equal(store[0]?.status, "completed")
  assert.equal(notifications[0]?.userId, "u1")
  assert.match(notifications[0]?.text ?? "", /đã được chuyển/)
})

void test("rejecting returns the money to the wallet once", async () => {
  const { service, wallet, notifications } = await makeService({
    seed: [pending()],
  })

  const row = await service.reject("w1", "Sai thông tin tài khoản")

  assert.equal(row.status, "rejected")
  assert.equal(row.adminNote, "Sai thông tin tài khoản")
  assert.deepEqual(wallet, [
    { op: "credit", userId: "u1", amount: 200_000, txId: "withdraw-refund-w1" },
  ])
  assert.match(notifications[0]?.text ?? "", /hoàn lại vào ví/)
  await assert.rejects(() => service.reject("w1", "again"), ConflictException)
})

void test("a resolved or unknown withdrawal can't be completed", async () => {
  const { service } = await makeService({
    seed: [pending({ status: "completed" })],
  })

  await assert.rejects(() => service.complete("w1", "x"), ConflictException)
  await assert.rejects(() => service.complete("nope", "x"), NotFoundException)
})

void test("the admin queue lists pending requests first", async () => {
  const { service } = await makeService({
    seed: [
      pending({
        withdrawalId: "done",
        status: "completed",
        requestedAt: "2026-10-01T10:00:00+07:00",
      }),
      pending({ withdrawalId: "wait" }),
    ],
  })

  const rows = await service.listAll()

  assert.deepEqual(
    rows.map((r) => r.id),
    ["wait", "done"]
  )
})
