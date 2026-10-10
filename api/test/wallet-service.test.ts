import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { HttpException } from "@nestjs/common"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { Wallet, WalletTx } from "../src/features/wallet/wallet.schema.js"
import { WalletService } from "../src/features/wallet/wallet.service.js"

// In-memory stand-ins for the two models + a connection whose `transaction`
// rolls the state back when the callback throws (what Mongo does for real).
async function makeService() {
  const state = {
    balances: new Map<string, number>(),
    txs: [] as { txId: string; userId: string; amount: number }[],
  }
  const walletModel = {
    findOneAndUpdate: (
      filter: { userId: string; balance?: { $gte: number } },
      update: { $inc: { balance: number } },
      opts: { upsert?: boolean }
    ) => {
      const current = state.balances.get(filter.userId)
      if (current === undefined && !opts.upsert) return Promise.resolve(null)
      if (filter.balance && (current ?? 0) < filter.balance.$gte) {
        return Promise.resolve(null)
      }
      const next = (current ?? 0) + update.$inc.balance
      state.balances.set(filter.userId, next)
      return Promise.resolve({ balance: next })
    },
    findOne: (filter: { userId: string }) => ({
      lean: () => {
        const balance = state.balances.get(filter.userId)
        return Promise.resolve(balance === undefined ? null : { balance })
      },
    }),
  }
  const txModel = {
    create: (docs: { txId: string; userId: string; amount: number }[]) => {
      if (state.txs.some((t) => t.txId === docs[0].txId)) {
        return Promise.reject(Object.assign(new Error("dup"), { code: 11000 }))
      }
      state.txs.push(docs[0])
      return Promise.resolve(docs)
    },
    exists: (filter: { txId: string }) =>
      Promise.resolve(
        state.txs.some((t) => t.txId === filter.txId) ? {} : null
      ),
  }
  const connection = {
    transaction: async (fn: (s?: unknown) => Promise<unknown>) => {
      const snapshot = {
        balances: new Map(state.balances),
        txs: [...state.txs],
      }
      try {
        return await fn(undefined)
      } catch (err) {
        state.balances = snapshot.balances
        state.txs = snapshot.txs
        throw err
      }
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      WalletService,
      { provide: getModelToken(Wallet.name), useValue: walletModel },
      { provide: getModelToken(WalletTx.name), useValue: txModel },
      { provide: getConnectionToken(), useValue: connection },
    ],
  }).compile()
  return { service: moduleRef.get(WalletService), state }
}

const movement = (txId: string) => ({
  txId,
  kind: "topup" as const,
  note: "test",
})

void test("credit adds to the balance and writes a ledger row", async () => {
  const { service, state } = await makeService()

  const res = await service.credit("u1", 50_000, movement("t1"))

  assert.deepEqual(res, { balance: 50_000, applied: true })
  assert.equal(state.txs.length, 1)
  assert.equal(state.txs[0].amount, 50_000)
})

void test("a replayed credit (same txId) moves no money", async () => {
  const { service, state } = await makeService()
  await service.credit("u1", 50_000, movement("t1"))

  const again = await service.credit("u1", 50_000, movement("t1"))

  assert.deepEqual(again, { balance: 50_000, applied: false })
  assert.equal(state.balances.get("u1"), 50_000)
  assert.equal(state.txs.length, 1)
})

void test("debit takes money and records a negative ledger row", async () => {
  const { service, state } = await makeService()
  await service.credit("u1", 100_000, movement("t1"))

  const res = await service.debit("u1", 30_000, {
    txId: "p1",
    kind: "payment",
    note: "pay",
  })

  assert.deepEqual(res, { balance: 70_000, applied: true })
  assert.equal(state.txs[1].amount, -30_000)
})

void test("debit beyond the balance throws 402 and changes nothing", async () => {
  const { service, state } = await makeService()
  await service.credit("u1", 10_000, movement("t1"))

  await assert.rejects(
    () =>
      service.debit("u1", 20_000, { txId: "p1", kind: "payment", note: "pay" }),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 402
  )
  assert.equal(state.balances.get("u1"), 10_000)
  assert.equal(state.txs.length, 1)
})

void test("a replayed debit does not charge twice", async () => {
  const { service, state } = await makeService()
  await service.credit("u1", 100_000, movement("t1"))
  const pay = { txId: "p1", kind: "payment" as const, note: "pay" }
  await service.debit("u1", 40_000, pay)

  const again = await service.debit("u1", 40_000, pay)

  assert.equal(again.applied, false)
  assert.equal(state.balances.get("u1"), 60_000)
})
