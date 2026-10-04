import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { RatingsService } from "../src/features/ratings/ratings.service.js"
import { Rating } from "../src/features/ratings/rating.schema.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * Peer ratings after a played match: only participants of a finished,
 * non-cancelled match may rate each other, once per (rater, ratee, match);
 * the ratee is notified; profiles read an average + newest reviews.
 */

function playedSession(
  overrides: Partial<PlaySessionData> = {}
): PlaySessionData {
  return {
    id: "s-1",
    title: "Trận tối",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2020-01-01",
    dayLabel: "",
    slot: "18:00",
    durationMin: 60,
    courtLabel: null,
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "An", initials: "AN", rsvp: "going", userId: "user-an" },
      { name: "Bình", initials: "BI", rsvp: "pending", userId: "user-bi" },
    ],
    level: "any",
    status: "booked",
    reservationId: "bk-1",
    listed: false,
    fillIntent: "court",
    venue: "Sân ABC",
    ward: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    ...overrides,
  }
}

async function makeService(opts: {
  session?: PlaySessionData | null
  createFails?: Error
  ratings?: { rateeId: string; stars: number }[]
  aggregate?: { average: number; count: number }[]
  recent?: {
    stars: number
    comment?: string
    raterName: string
    createdAt: Date
  }[]
}) {
  const created: unknown[] = []
  const notified: { userId: string; input: { kind: string; text: string } }[] =
    []
  const ratingModel = {
    create(doc: unknown) {
      if (opts.createFails) return Promise.reject(opts.createFails)
      created.push(doc)
      return Promise.resolve(doc)
    },
    find: () => ({
      select: () => ({ lean: () => Promise.resolve(opts.ratings ?? []) }),
      sort: () => ({
        limit: () => ({ lean: () => Promise.resolve(opts.recent ?? []) }),
      }),
    }),
    aggregate: () => Promise.resolve(opts.aggregate ?? []),
  }
  const sessionModel = {
    findOne: () => ({
      sort: () => ({
        lean: () =>
          Promise.resolve(
            opts.session === null
              ? null
              : { userId: "host-1", data: opts.session ?? playedSession() }
          ),
      }),
    }),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      RatingsService,
      { provide: getModelToken(Rating.name), useValue: ratingModel },
      { provide: getModelToken(PlaySession.name), useValue: sessionModel },
      {
        provide: ProfileService,
        useValue: {
          getProfile: (id: string) =>
            Promise.resolve({ user: { name: `Name ${id}`, initials: "XX" } }),
        },
      },
      {
        provide: NotificationsService,
        useValue: {
          create: (userId: string, input: { kind: string; text: string }) => {
            notified.push({ userId, input })
            return Promise.resolve()
          },
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(RatingsService), created, notified }
}

void test("rate: a participant rates another after the match, and the ratee is notified", async () => {
  const { service, created, notified } = await makeService({})
  await service.rate("host-1", {
    sessionId: "s-1",
    rateeId: "user-an",
    stars: 5,
    comment: "  Đánh hay!  ",
  })
  assert.deepEqual(created, [
    {
      raterId: "host-1",
      raterName: "Name host-1",
      rateeId: "user-an",
      sessionId: "s-1",
      stars: 5,
      comment: "Đánh hay!",
    },
  ])
  assert.equal(notified.length, 1)
  assert.equal(notified[0].userId, "user-an")
  assert.equal(notified[0].input.kind, "rating")
})

void test("rate rejects self-rating, unknown/cancelled/unfinished matches and outsiders", async () => {
  const ok = await makeService({})
  await assert.rejects(
    ok.service.rate("user-an", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )
  // A pending invitee never played.
  await assert.rejects(
    ok.service.rate("user-bi", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    ForbiddenException
  )
  await assert.rejects(
    ok.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-bi",
      stars: 4,
    }),
    BadRequestException
  )

  const missing = await makeService({ session: null })
  await assert.rejects(
    missing.service.rate("host-1", {
      sessionId: "x",
      rateeId: "user-an",
      stars: 4,
    }),
    NotFoundException
  )

  const cancelled = await makeService({
    session: playedSession({ status: "cancelled" }),
  })
  await assert.rejects(
    cancelled.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )

  const future = await makeService({
    session: playedSession({ dayKey: "2999-01-01" }),
  })
  await assert.rejects(
    future.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )
})

void test("rate maps a duplicate (already rated) to 409", async () => {
  const { service, notified } = await makeService({
    createFails: Object.assign(new Error("dup"), { code: 11000 }),
  })
  await assert.rejects(
    service.rate("host-1", { sessionId: "s-1", rateeId: "user-an", stars: 3 }),
    ConflictException
  )
  assert.equal(notified.length, 0)
})

void test("mine lists who the caller rated in a match", async () => {
  const { service } = await makeService({
    ratings: [{ rateeId: "user-an", stars: 4 }],
  })
  assert.deepEqual(await service.mine("host-1", "s-1"), [
    { rateeId: "user-an", stars: 4 },
  ])
})

void test("summary: empty for an unrated player, else rounded average + newest reviews", async () => {
  const empty = await makeService({})
  assert.deepEqual(await empty.service.summary("u"), {
    average: 0,
    count: 0,
    recent: [],
  })

  const rated = await makeService({
    aggregate: [{ average: 4.666, count: 3 }],
    recent: [
      {
        stars: 5,
        comment: "Tuyệt",
        raterName: "An",
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        stars: 4,
        raterName: "Bình",
        createdAt: new Date("2026-09-30T10:00:00Z"),
      },
    ],
  })
  const s = await rated.service.summary("u")
  assert.equal(s.average, 4.7)
  assert.equal(s.count, 3)
  assert.deepEqual(s.recent[0], {
    stars: 5,
    comment: "Tuyệt",
    raterName: "An",
    createdAt: "2026-10-01T10:00:00.000Z",
  })
  assert.equal("comment" in s.recent[1], false)
})
