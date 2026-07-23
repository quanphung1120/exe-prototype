import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { Notification } from "../src/features/notifications/notification.schema.js"

/**
 * Service-level tests for the Phase 7 transactional notification feed
 * (`NotificationsController` → `NotificationsService`): idempotent delivery
 * (`create` dedupes on the producer's `id`, which becomes `notifId`), the
 * newest-first listing shape `GET /api/notifications` returns, and the
 * read/read-all mutations. Mongoose is mocked (no real DB), the same pattern
 * `sessions-service.test.ts` uses.
 */

/** A duplicate-key error, matching `isDuplicateKeyError`'s shape check. */
function duplicateKeyError(): Error & { code: number } {
  return Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })
}

async function makeService(
  modelMock: Record<string, (...args: unknown[]) => unknown>
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: getModelToken(Notification.name), useValue: modelMock },
    ],
  }).compile()
  return moduleRef.get(NotificationsService)
}

// ── create ───────────────────────────────────────────────────────────────────

void test("create inserts a notification with the producer's id as notifId", async () => {
  let created: unknown
  const service = await makeService({
    create: (doc: unknown) => {
      created = doc
      return Promise.resolve(doc)
    },
  })

  await service.create("user-1", {
    id: "booking-approved-b1",
    kind: "booking",
    text: "Chủ sân đã duyệt đặt sân của bạn.",
    href: "/dashboard/bookings",
  })

  assert.deepEqual(created, {
    userId: "user-1",
    notifId: "booking-approved-b1",
    kind: "booking",
    text: "Chủ sân đã duyệt đặt sân của bạn.",
    href: "/dashboard/bookings",
    read: false,
  })
})

void test("create swallows a duplicate-key collision (retried producer, idempotent)", async () => {
  let calls = 0
  const service = await makeService({
    create: () => {
      calls++
      return Promise.reject(duplicateKeyError())
    },
  })

  // Must not throw — the sweeper/decision producers call this unconditionally
  // and can't have a benign redelivery crash the request.
  await service.create("user-1", {
    id: "booking-approved-b1",
    kind: "booking",
    text: "Chủ sân đã duyệt đặt sân của bạn.",
  })

  assert.equal(calls, 1)
})

void test("create rethrows a non-duplicate-key error", async () => {
  const service = await makeService({
    create: () => Promise.reject(new Error("connection reset")),
  })

  await assert.rejects(
    () =>
      service.create("user-1", {
        id: "booking-approved-b1",
        kind: "booking",
        text: "x",
      }),
    /connection reset/
  )
})

// ── list ─────────────────────────────────────────────────────────────────────

void test("list maps lean docs to NotificationRecord, newest first", async () => {
  const createdAt = new Date("2026-07-20T10:00:00.000Z")
  let sortArg: unknown
  const service = await makeService({
    find: () => ({
      sort: (arg: unknown) => {
        sortArg = arg
        return {
          lean: () =>
            Promise.resolve([
              {
                notifId: "booking-approved-b1",
                kind: "booking",
                text: "Chủ sân đã duyệt đặt sân của bạn.",
                href: "/dashboard/bookings",
                read: false,
                createdAt,
              },
            ]),
        }
      },
    }),
  })

  const result = await service.list("user-1")

  assert.deepEqual(sortArg, { createdAt: -1 })
  assert.deepEqual(result, [
    {
      id: "booking-approved-b1",
      kind: "booking",
      text: "Chủ sân đã duyệt đặt sân của bạn.",
      href: "/dashboard/bookings",
      read: false,
      createdAt: createdAt.toISOString(),
    },
  ])
})

// ── markRead / markAllRead ──────────────────────────────────────────────────

void test("markRead sets read on the caller's own notification by notifId", async () => {
  let filter: unknown
  let update: unknown
  const service = await makeService({
    updateOne: (f: unknown, u: unknown) => {
      filter = f
      update = u
      return Promise.resolve({ acknowledged: true })
    },
  })

  await service.markRead("user-1", "booking-approved-b1")

  assert.deepEqual(filter, { userId: "user-1", notifId: "booking-approved-b1" })
  assert.deepEqual(update, { $set: { read: true } })
})

void test("markRead is a no-op (no throw) for an unknown/client-only id", async () => {
  const service = await makeService({
    updateOne: () => Promise.resolve({ acknowledged: true, matchedCount: 0 }),
  })

  // A client-only notification id (e.g. a matchmaking event) round-trips
  // through the same optimistic mark-read call and must never error.
  await service.markRead("user-1", "nj-some-room")
})

void test("markAllRead flips every unread notification for the caller", async () => {
  let filter: unknown
  let update: unknown
  const service = await makeService({
    updateMany: (f: unknown, u: unknown) => {
      filter = f
      update = u
      return Promise.resolve({ acknowledged: true })
    },
  })

  await service.markAllRead("user-1")

  assert.deepEqual(filter, { userId: "user-1", read: false })
  assert.deepEqual(update, { $set: { read: true } })
})
