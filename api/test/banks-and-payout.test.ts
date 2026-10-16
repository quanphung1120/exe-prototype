import assert from "node:assert/strict"
import test from "node:test"

import { plainToInstance } from "class-transformer"
import { validate } from "class-validator"

import {
  BanksService,
  type BanksFetch,
} from "../src/features/banks/banks.service.js"
import { PayoutDto } from "../src/features/brands/payout.dto.js"
import { PayoutService } from "../src/features/brands/payout.service.js"

const ROWS = [
  {
    name: "Ngân hàng Quân đội",
    code: "MB",
    bin: "970422",
    shortName: "MBBank",
    logo: "https://img/mb.png",
    transferSupported: 1,
  },
  {
    name: "No transfer",
    code: "XX",
    bin: "999999",
    shortName: "XX",
    transferSupported: 0,
  },
  { name: "Broken", code: "", bin: "", shortName: "", transferSupported: 1 },
]

function makeBanks(opts: { fail?: boolean } = {}) {
  let calls = 0
  const state = { fail: opts.fail ?? false }
  const fetcher: BanksFetch = () => {
    calls++
    return state.fail
      ? Promise.reject(new Error("down"))
      : Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ code: "00", data: ROWS }),
        })
  }
  return { service: new BanksService(fetcher), calls: () => calls, state }
}

void test("banks keeps only transferable, complete banks", async () => {
  const { service } = makeBanks()
  const banks = await service.list()
  assert.deepEqual(
    banks.map((b) => b.bin),
    ["970422"]
  )
  assert.equal((await service.find("970422"))?.shortName, "MBBank")
  assert.equal(await service.find("999999"), undefined)
})

void test("banks is cached for a day, then refetched", async () => {
  const { service, calls } = makeBanks()
  const t0 = 1_000_000
  await service.list(t0)
  await service.list(t0 + 60_000)
  assert.equal(calls(), 1)
  await service.list(t0 + 25 * 60 * 60 * 1000)
  assert.equal(calls(), 2)
})

void test("banks serves the stale list when the refresh fails, and 503s with none", async () => {
  const { service, state } = makeBanks()
  const t0 = 1_000_000
  await service.list(t0)
  state.fail = true
  const stale = await service.list(t0 + 25 * 60 * 60 * 1000)
  assert.equal(stale.length, 1)

  const cold = makeBanks({ fail: true })
  await assert.rejects(cold.service.list(), /danh sách ngân hàng/)
})

async function errorsFor(input: Record<string, unknown>) {
  const dto = plainToInstance(PayoutDto, input)
  const errors = await validate(dto)
  return { dto, errors }
}

void test("PayoutDto normalizes the holder name and account number", async () => {
  const { dto, errors } = await errorsFor({
    bankBin: "970422",
    accountNo: "0123 4567 89",
    accountName: "  Nguyễn Văn  Đức ",
  })
  assert.equal(errors.length, 0)
  assert.equal(dto.accountNo, "0123456789")
  assert.equal(dto.accountName, "NGUYEN VAN DUC")
})

void test("PayoutDto rejects a malformed bin, account number or name", async () => {
  const bad = await errorsFor({
    bankBin: "MB",
    accountNo: "12ab",
    accountName: "A",
  })
  assert.equal(bad.errors.length, 3)
})

function makePayouts(doc: Record<string, unknown> | null) {
  const saved: unknown[] = []
  const model = {
    findOne: () => {
      const q = {
        select: () => q,
        lean: () => Promise.resolve(doc),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            doc && {
              ...doc,
              markModified: () => undefined,
              save: () => {
                saved.push({ ...doc })
                return Promise.resolve()
              },
            }
          ),
      }
      return q
    },
  }
  const banks = makeBanks().service
  return { service: new PayoutService(model as never, {} as never, banks), saved }
}

void test("setPayout fills bank name and code from the VietQR list", async () => {
  const { service } = makePayouts({ brandId: "b1", ownerId: "u1" })
  const payout = await service.setPayout("u1", {
    bankBin: "970422",
    accountNo: "0123456789",
    accountName: "NGUYEN VAN A",
  })
  assert.deepEqual(payout, {
    bankBin: "970422",
    bankCode: "MB",
    bankName: "MBBank",
    accountNo: "0123456789",
    accountName: "NGUYEN VAN A",
  })
})

void test("setPayout rejects a bank that isn't on the list or an owner without a brand", async () => {
  const { service } = makePayouts({ brandId: "b1", ownerId: "u1" })
  await assert.rejects(
    service.setPayout("u1", {
      bankBin: "999999",
      accountNo: "0123456789",
      accountName: "A B",
    }),
    /chưa hỗ trợ/
  )
  const none = makePayouts(null).service
  await assert.rejects(
    none.setPayout("u1", {
      bankBin: "970422",
      accountNo: "0123456789",
      accountName: "A B",
    }),
    /thương hiệu/
  )
})
