import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { NotFoundException } from "@nestjs/common"
import type { Model } from "mongoose"

import {
  ANONYMOUS_NAME,
  AppReviewsService,
  FEATURED_LIMIT,
  FEATURED_MIN_COMMENT,
  FEATURED_MIN_RATING,
} from "../src/features/app-reviews/app-reviews.service.js"
import type { AppReviewDocument } from "../src/features/app-reviews/app-review.schema.js"
import type { ProfileService } from "../src/features/players/profile.service.js"
import type { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"
import type { AccountType } from "../src/shared/index.js"

/**
 * App reviews: one per user (re-submitting edits it), the display name never
 * comes from an email, an admin's hide survives an edit, and the landing only
 * quotes visible, high-rated reviews with real text.
 */

const UPDATED = new Date("2026-10-01T03:00:00.000Z")

function makeService(opts: {
  publicName?: string | null
  image?: string
  accountType?: AccountType | null
  aggregate?: { average: number; count: number }[]
  featured?: Record<string, unknown>[]
  updateMatched?: number
}) {
  const calls: {
    upsert?: { filter: unknown; update: Record<string, unknown> }
    findFilter?: Record<string, unknown>
    findLimit?: number
    updateOne?: { filter: unknown; update: unknown }
  } = {}

  const model = {
    findOneAndUpdate(filter: unknown, update: Record<string, unknown>) {
      calls.upsert = { filter, update }
      const set = update.$set as Record<string, unknown>
      return {
        lean: () =>
          Promise.resolve({
            _id: "r1",
            userId: "user-1",
            ...set,
            hidden: false,
            updatedAt: UPDATED,
          }),
      }
    },
    findOne: () => ({ lean: () => Promise.resolve(null) }),
    aggregate: () => Promise.resolve(opts.aggregate ?? []),
    find(filter: Record<string, unknown> = {}) {
      calls.findFilter = filter
      return {
        sort: () => ({
          limit: (n: number) => {
            calls.findLimit = n
            return { lean: () => Promise.resolve(opts.featured ?? []) }
          },
          lean: () => Promise.resolve(opts.featured ?? []),
        }),
      }
    },
    updateOne(filter: unknown, update: unknown) {
      calls.updateOne = { filter, update }
      return Promise.resolve({ matchedCount: opts.updateMatched ?? 1 })
    },
  }
  const profiles = {
    getProfile: () =>
      Promise.resolve({ accountType: opts.accountType ?? null }),
  }
  const directory = {
    getPublicProfile: () =>
      Promise.resolve({
        name: opts.publicName === undefined ? "Viên T." : opts.publicName,
        ...(opts.image ? { image: opts.image } : {}),
      }),
  }

  const service = new AppReviewsService(
    model as unknown as Model<AppReviewDocument>,
    profiles as unknown as ProfileService,
    directory as unknown as ClerkDirectoryService
  )
  return { service, calls }
}

void test("upsert stores the public name, initials, role and trimmed comment", async () => {
  const { service, calls } = makeService({
    publicName: "Viên T.",
    image: "https://img/u.png",
    accountType: "player",
  })
  const mine = await service.upsert("user-1", {
    rating: 5,
    comment: "  Đặt sân nhanh, ghép trận chuẩn  ",
  })

  assert.deepEqual(calls.upsert?.filter, { userId: "user-1" })
  const set = calls.upsert?.update.$set as Record<string, unknown>
  assert.equal(set.authorName, "Viên T.")
  assert.equal(set.initials, "VT")
  assert.equal(set.role, "player")
  assert.equal(set.comment, "Đặt sân nhanh, ghép trận chuẩn")
  assert.equal(set.image, "https://img/u.png")
  assert.deepEqual(mine, {
    rating: 5,
    comment: "Đặt sân nhanh, ghép trận chuẩn",
    updatedAt: UPDATED.toISOString(),
    hidden: false,
  })
})

void test("upsert never resets an admin's hide — hidden is set on insert only", async () => {
  const { service, calls } = makeService({})
  await service.upsert("user-1", { rating: 4 })
  const update = calls.upsert?.update ?? {}
  assert.equal("hidden" in (update.$set as object), false)
  assert.deepEqual(update.$setOnInsert, { userId: "user-1", hidden: false })
})

void test("upsert falls back to an anonymous name and drops a stale avatar", async () => {
  const { service, calls } = makeService({ publicName: null })
  await service.upsert("user-1", { rating: 3 })
  const update = calls.upsert?.update ?? {}
  assert.equal(
    (update.$set as Record<string, unknown>).authorName,
    ANONYMOUS_NAME
  )
  assert.deepEqual(update.$unset, { image: 1 })
})

void test("venue and both account types review as a venue owner", async () => {
  for (const accountType of ["venue", "both"] as const) {
    const { service, calls } = makeService({ accountType })
    await service.upsert("user-1", { rating: 5 })
    assert.equal(
      (calls.upsert?.update.$set as Record<string, unknown>).role,
      "venue"
    )
  }
})

void test("publicSummary is empty when there are no visible reviews", async () => {
  const { service, calls } = makeService({ aggregate: [] })
  assert.deepEqual(await service.publicSummary(), {
    average: 0,
    count: 0,
    featured: [],
  })
  assert.equal(calls.findFilter, undefined)
})

void test("publicSummary rounds the average and quotes only qualifying reviews", async () => {
  const { service, calls } = makeService({
    aggregate: [{ average: 4.66667, count: 3 }],
    featured: [
      {
        _id: "r1",
        userId: "user-1",
        authorName: "Viên T.",
        initials: "VT",
        role: "player",
        rating: 5,
        comment: "Ứng dụng rất tiện cho người chơi cầu lông",
        hidden: false,
        updatedAt: UPDATED,
      },
    ],
  })
  const summary = await service.publicSummary()

  assert.equal(summary.average, 4.7)
  assert.equal(summary.count, 3)
  assert.deepEqual(summary.featured, [
    {
      id: "r1",
      authorName: "Viên T.",
      initials: "VT",
      role: "player",
      rating: 5,
      comment: "Ứng dụng rất tiện cho người chơi cầu lông",
      updatedAt: UPDATED.toISOString(),
    },
  ])
  // The quote query excludes hidden, low-rated and too-short reviews.
  assert.equal(calls.findFilter?.hidden, false)
  assert.deepEqual(calls.findFilter?.rating, { $gte: FEATURED_MIN_RATING })
  assert.deepEqual(calls.findFilter?.$expr, {
    $gte: [{ $strLenCP: "$comment" }, FEATURED_MIN_COMMENT],
  })
  assert.equal(calls.findLimit, FEATURED_LIMIT)
})

void test("setHidden toggles the flag and 404s an unknown review", async () => {
  const ok = makeService({})
  await ok.service.setHidden("user-1", true)
  assert.deepEqual(ok.calls.updateOne, {
    filter: { userId: "user-1" },
    update: { $set: { hidden: true } },
  })

  const missing = makeService({ updateMatched: 0 })
  await assert.rejects(
    missing.service.setHidden("nobody", true),
    NotFoundException
  )
})
