import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ForbiddenException, BadRequestException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { Reflector } from "@nestjs/core"
import { getConnectionToken, getModelToken } from "@nestjs/mongoose"
import type { ExecutionContext } from "@nestjs/common"

import { RolesGuard } from "../src/common/roles.guard.js"
import { ROLES_KEY } from "../src/common/roles.decorator.js"
import { setRequestRole, setRequestUserId } from "../src/common/request-auth.js"
import { BrandsService } from "../src/features/brands/brands.service.js"
import { VenuesService } from "../src/features/venues/venues.service.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import { BookingLock } from "../src/features/bookings/booking-lock.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { Venue } from "../src/features/venues/venue.schema.js"

/**
 * The admin feature's guard rail (`RolesGuard`) and the two service-level
 * behaviors it protects: `VenuesService`'s approval workflow (setApproval/
 * listPendingApprovals) and `BookingsService`'s approval gate on new/moved
 * bookings. Mongoose is mocked (no real DB), matching
 * brands-and-scoping.test.ts's (Venues) and bookings-service.test.ts's
 * (Bookings) DI-bypass style.
 */

// ── RolesGuard ───────────────────────────────────────────────────────────────

function ctxWithRoles(roles: string[] | undefined, callerRole?: string) {
  const handler = () => undefined
  if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler)
  const req: Record<PropertyKey, unknown> = {}
  if (callerRole) setRequestRole(req as never, callerRole as never)
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

void test("RolesGuard allows a route with no @Roles metadata", () => {
  const guard = new RolesGuard(new Reflector())
  assert.equal(guard.canActivate(ctxWithRoles(undefined)), true)
})

void test("RolesGuard allows a caller whose stashed role matches", () => {
  const guard = new RolesGuard(new Reflector())
  assert.equal(guard.canActivate(ctxWithRoles(["admin"], "admin")), true)
})

void test("RolesGuard 403s a signed-in caller with no role", () => {
  const guard = new RolesGuard(new Reflector())
  assert.throws(
    () => guard.canActivate(ctxWithRoles(["admin"])),
    ForbiddenException
  )
})

void test("RolesGuard 403s a caller whose role isn't in the required set", () => {
  const guard = new RolesGuard(new Reflector())
  assert.throws(
    () => guard.canActivate(ctxWithRoles(["admin"], "moderator")),
    ForbiddenException
  )
})

void test("request-auth stashes and reads back the role set by ClerkAuthGuard", () => {
  const req: Record<PropertyKey, unknown> = {}
  setRequestUserId(req as never, "user-1")
  setRequestRole(req as never, "admin")
  const guard = new RolesGuard(new Reflector())
  assert.equal(guard.canActivate(ctxWithRoles(["admin"], "admin")), true)
})

// ── VenuesService approval workflow ──────────────────────────────────────────

type VenuesCtorArgs = ConstructorParameters<typeof VenuesService>

void test("createVenue stamps the brand's inherited approval status (pending brand → pending branch)", async () => {
  const created: Record<string, unknown>[] = []
  const venueModel = {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1),
    distinct: () => Promise.resolve([] as string[]),
    create: (doc: Record<string, unknown>) => {
      created.push(doc)
      return Promise.resolve(doc)
    },
  }
  const service = new VenuesService(
    ...([venueModel, {}, {}, {}, {}, {}] as unknown as VenuesCtorArgs)
  )

  const info = await service.createVenue({
    name: "Sân Cầu Lông Mới",
    ward: "Quận 1",
    province: "TP. Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    managerName: "Quản lý",
    ownerId: "owner-1",
    brandId: "brand-1",
    approval: "pending",
  })

  assert.equal(info.approval, "pending")
  assert.equal(created[0]?.approval, "pending")
  assert.equal(created[0]?.brandId, "brand-1")
})

void test("createVenue defaults a branch to approved when no brand status is passed (approved brand)", async () => {
  const created: Record<string, unknown>[] = []
  const venueModel = {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1),
    distinct: () => Promise.resolve([] as string[]),
    create: (doc: Record<string, unknown>) => {
      created.push(doc)
      return Promise.resolve(doc)
    },
  }
  const service = new VenuesService(
    ...([venueModel, {}, {}, {}, {}, {}] as unknown as VenuesCtorArgs)
  )

  const info = await service.createVenue({
    name: "Chi nhánh 2",
    ward: "Quận 1",
    province: "TP. Hồ Chí Minh",
    sports: ["badminton"],
    openFrom: "06:00",
    openTo: "22:00",
    managerName: "Quản lý",
    ownerId: "owner-1",
  })

  assert.equal(info.approval, "approved")
  assert.equal(created[0]?.approval, "approved")
})

void test("BrandsService.listPendingApprovals returns only pending brands, merging the resolved status", async () => {
  const docs = [
    { brandId: "b1", info: { id: "b1", name: "A" }, approval: "pending" },
  ]
  const brandModel = {
    find: (filter: Record<string, unknown>) => ({
      sort: () => ({
        lean: () => Promise.resolve(filter.approval === "pending" ? docs : []),
      }),
    }),
  }
  const service = new BrandsService(brandModel as never)

  const pending = await service.listPendingApprovals()

  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.approval, "pending")
})

void test("BrandsService.setApproval approves a brand and clears any prior rejection reason", async () => {
  const doc: {
    brandId: string
    info: { id: string; name: string }
    approval: string
    approvalReason?: string
    save: () => Promise<void>
  } = {
    brandId: "b1",
    info: { id: "b1", name: "A" },
    approval: "rejected",
    approvalReason: "Thiếu giấy phép",
    save: () => Promise.resolve(),
  }
  const brandModel = { findOne: () => Promise.resolve(doc) }
  const service = new BrandsService(brandModel as never)

  const info = await service.setApproval("b1", "approved")

  assert.equal(info.approval, "approved")
  assert.equal(doc.approvalReason, undefined)
})

void test("BrandsService.setApproval rejects a brand with a reason", async () => {
  const doc: {
    brandId: string
    info: { id: string; name: string }
    approval: string
    approvalReason?: string
    save: () => Promise<void>
  } = {
    brandId: "b1",
    info: { id: "b1", name: "A" },
    approval: "pending",
    save: () => Promise.resolve(),
  }
  const brandModel = { findOne: () => Promise.resolve(doc) }
  const service = new BrandsService(brandModel as never)

  const info = await service.setApproval("b1", "rejected", "Thiếu giấy phép")

  assert.equal(info.approval, "rejected")
  assert.equal(doc.approvalReason, "Thiếu giấy phép")
})

void test("setApprovalForBrand propagates the decision onto every branch's denormalized copy", async () => {
  const calls: { filter: unknown; update: Record<string, unknown> }[] = []
  const venueModel = {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1),
    updateMany: (filter: unknown, update: Record<string, unknown>) => {
      calls.push({ filter, update })
      return Promise.resolve({})
    },
  }
  const service = new VenuesService(
    ...([venueModel, {}, {}, {}, {}, {}] as unknown as VenuesCtorArgs)
  )

  await service.setApprovalForBrand("b1", "approved")
  await service.setApprovalForBrand("b1", "rejected", "Thiếu giấy phép")

  assert.deepEqual(calls[0]?.filter, {
    $or: [{ brandId: "b1" }, { "info.brandId": "b1" }],
  })
  const approveSet = calls[0]?.update.$set as Record<string, unknown>
  assert.equal(approveSet.approval, "approved")
  assert.equal(approveSet.brandId, "b1")
  assert.deepEqual(calls[0]?.update.$unset, { approvalReason: "" })
  const rejectSet = calls[1]?.update.$set as Record<string, unknown>
  assert.equal(rejectSet.approval, "rejected")
  assert.equal(rejectSet.approvalReason, "Thiếu giấy phép")
})

void test("startup reconciles a legacy branch from its canonical approved brand", async () => {
  const calls: { filter: unknown; update: Record<string, unknown> }[] = []
  const venueModel = {
    syncIndexes: () => Promise.resolve([]),
    countDocuments: () => Promise.resolve(1),
    updateMany: (filter: unknown, update: Record<string, unknown>) => {
      calls.push({ filter, update })
      return Promise.resolve({ modifiedCount: 1 })
    },
  }
  const brands = {
    listAll: () =>
      Promise.resolve([
        { id: "b1", ownerId: "owner-1", name: "Brand", approval: "approved" },
      ]),
  }
  const service = new VenuesService(
    ...([venueModel, {}, {}, {}, {}, brands] as unknown as VenuesCtorArgs)
  )

  await service.onModuleInit()

  assert.deepEqual(calls[0]?.filter, {
    $or: [{ brandId: "b1" }, { "info.brandId": "b1" }],
  })
  const set = calls[0]?.update.$set as Record<string, unknown>
  assert.equal(set.brandId, "b1")
  assert.equal(set.approval, "approved")
  assert.deepEqual(calls[0]?.update.$unset, { approvalReason: "" })
})

// ── BookingsService approval gate ────────────────────────────────────────────

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

function makeVenueDoc(overrides: Record<string, unknown> = {}) {
  return {
    venueId: "v9",
    ownerId: "owner-1",
    info: { openFrom: "06:00", openTo: "23:00" },
    ops: {
      courts: [
        {
          id: "v9c1",
          name: "Sân 1",
          sport: "badminton",
          state: "available",
          pricePerHour: 200_000,
        },
      ],
      customers: [] as { id: string; userId?: string }[],
    },
    markModified: () => {},
    save: () => Promise.resolve(),
    ...overrides,
  }
}

async function makeBookingsService(venueDoc: ReturnType<typeof makeVenueDoc>) {
  const bookingModelMock = {
    findOne: () => makeQuery(null),
    find: () => makeQuery([]),
    create: (records: unknown[]) =>
      Promise.resolve(
        records.map((r) => ({
          ...(r as object),
          save: () => Promise.resolve(),
        }))
      ),
  }
  const venueModelMock = { findOne: () => makeQuery(venueDoc) }
  const connectionMock = {
    transaction: (fn: (session?: unknown) => Promise<unknown>) => fn(undefined),
  }
  const profilesMock = {
    getProfile: () =>
      Promise.resolve({ user: { name: "Khách Test", initials: "KT" } }),
  }
  const notificationsMock = { create: () => Promise.resolve() }
  const configMock = { get: (_key: string, fallback?: unknown) => fallback }

  const moduleRef = await Test.createTestingModule({
    providers: [
      BookingsService,
      { provide: getModelToken(Booking.name), useValue: bookingModelMock },
      { provide: getModelToken(BookingLock.name), useValue: {} },
      { provide: getModelToken(Venue.name), useValue: venueModelMock },
      { provide: getConnectionToken(), useValue: connectionMock },
      { provide: ProfileService, useValue: profilesMock },
      { provide: NotificationsService, useValue: notificationsMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile()

  return moduleRef.get(BookingsService)
}

void test("createHold rejects a booking against a venue still pending admin approval", async () => {
  const service = await makeBookingsService(
    makeVenueDoc({ approval: "pending" })
  )

  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
      }),
    BadRequestException
  )
})

void test("createHold rejects a booking against a rejected venue", async () => {
  const service = await makeBookingsService(
    makeVenueDoc({ approval: "rejected" })
  )

  await assert.rejects(
    () =>
      service.createHold("user-1", {
        courtId: "v9c1",
        dateKey: "2026-07-21",
        start: "18:00",
        durationMin: 60,
      }),
    BadRequestException
  )
})

void test("createHold allows a booking against an approved venue", async () => {
  const service = await makeBookingsService(
    makeVenueDoc({ approval: "approved" })
  )

  const result = await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })

  assert.equal(result.status, "awaiting_payment")
})

void test("createHold allows a booking against a venue with no approval field (legacy/demo seed)", async () => {
  const service = await makeBookingsService(makeVenueDoc())

  const result = await service.createHold("user-1", {
    courtId: "v9c1",
    dateKey: "2026-07-21",
    start: "18:00",
    durationMin: 60,
  })

  assert.equal(result.status, "awaiting_payment")
})
