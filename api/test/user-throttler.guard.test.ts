import assert from "node:assert/strict"
import { test, after } from "node:test"

import "reflect-metadata"

import { Reflector } from "@nestjs/core"
import { ThrottlerException, ThrottlerStorageService } from "@nestjs/throttler"
import type { ExecutionContext } from "@nestjs/common"

import { setRequestUserId } from "../src/common/request-auth.js"
import {
  USER_THROTTLE_KEY,
  UserThrottlerGuard,
} from "../src/common/user-throttler.guard.js"

const storage = new ThrottlerStorageService()
after(() => storage.onApplicationShutdown())

async function makeGuard() {
  const guard = new UserThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 120 }] },
    storage,
    new Reflector()
  )
  await guard.onModuleInit()
  return guard
}

let handlerCounter = 0

function makeHandler(limit?: number, ttl = 60_000) {
  // Distinct function identity/name per call: the base guard's generateKey
  // includes `handler.name`, so two same-named functions would collide.
  handlerCounter += 1
  const handler = {
    [`handler${handlerCounter}`]: () => {},
  }[`handler${handlerCounter}`]
  if (limit !== undefined) {
    Reflect.defineMetadata(USER_THROTTLE_KEY, { limit, ttl }, handler)
  }
  return handler
}

function makeContext(handler: object, req: object): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ header: () => {} }),
    }),
  } as unknown as ExecutionContext
}

function makeReq(ip: string, userId?: string) {
  const req = { headers: {}, ip }
  if (userId) setRequestUserId(req as never, userId)
  return req
}

void test("allows `limit` calls for one user then rejects the next", async () => {
  const guard = await makeGuard()
  const handler = makeHandler(3)
  const req = makeReq("1.1.1.1", "user-1")

  for (let i = 0; i < 3; i++) {
    assert.equal(await guard.canActivate(makeContext(handler, req)), true)
  }

  await assert.rejects(
    guard.canActivate(makeContext(handler, req)),
    (err: unknown) => {
      assert.ok(err instanceof ThrottlerException)
      assert.equal(err.getStatus(), 429)
      assert.match(err.message, /thử lại sau một phút/)
      return true
    }
  )
})

void test("distinct userIds get independent quotas", async () => {
  const guard = await makeGuard()
  const handler = makeHandler(1)
  const reqA = makeReq("2.2.2.2", "user-a")
  const reqB = makeReq("2.2.2.2", "user-b")

  assert.equal(await guard.canActivate(makeContext(handler, reqA)), true)
  await assert.rejects(guard.canActivate(makeContext(handler, reqA)))
  // user-b still has quota on the same handler/IP.
  assert.equal(await guard.canActivate(makeContext(handler, reqB)), true)
})

void test("falls back to the library default (10/60s) when no metadata is set", async () => {
  const guard = await makeGuard()
  const handler = makeHandler()
  const req = makeReq("3.3.3.3", "user-default")

  for (let i = 0; i < 10; i++) {
    assert.equal(await guard.canActivate(makeContext(handler, req)), true)
  }
  await assert.rejects(guard.canActivate(makeContext(handler, req)))
})

void test("falls back to IP tracking when the request has no userId", async () => {
  const guard = await makeGuard()
  const handler = makeHandler(1)
  const reqX = makeReq("4.4.4.1")
  const reqY = makeReq("4.4.4.2")

  assert.equal(await guard.canActivate(makeContext(handler, reqX)), true)
  await assert.rejects(guard.canActivate(makeContext(handler, reqX)))
  // Different IP, no userId on either request — independent bucket.
  assert.equal(await guard.canActivate(makeContext(handler, reqY)), true)
})

void test("per-route isolation: a capped user on handler A is still allowed on handler B", async () => {
  const guard = await makeGuard()
  const handlerA = makeHandler(1)
  const handlerB = makeHandler(1)
  const req = makeReq("5.5.5.5", "user-multi-route")

  assert.equal(await guard.canActivate(makeContext(handlerA, req)), true)
  await assert.rejects(guard.canActivate(makeContext(handlerA, req)))
  assert.equal(await guard.canActivate(makeContext(handlerB, req)), true)
})
