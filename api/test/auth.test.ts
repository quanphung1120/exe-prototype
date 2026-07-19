import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"
import "dotenv/config"

import { UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { ConfigService } from "@nestjs/config"
import type { ExecutionContext } from "@nestjs/common"

import { ClerkAuthGuard } from "../src/common/clerk-auth.guard.js"
import { IS_PUBLIC_KEY } from "../src/common/public.decorator.js"

// Give Clerk *some* keys so the middleware can initialize its client. The cases
// here are all anonymous / malformed — Clerk resolves those networklessly, so
// dummy keys are enough when real ones aren't set.
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy"
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_dummy"

// A ConfigService stand-in that just reads process.env (all the guard needs).
const config = {
  get: (key: string) => process.env[key],
} as unknown as ConfigService

function makeGuard() {
  return new ClerkAuthGuard(new Reflector(), config)
}

/** A minimal Express-ish request/response pair for the guard. */
function ctx(
  { authorization }: { authorization?: string } = {},
  handler: (...args: unknown[]) => unknown = () => undefined
): ExecutionContext {
  const req = {
    headers: authorization ? { authorization } : {},
    cookies: {},
    url: "/api/seed",
    method: "GET",
  }
  const res = {
    setHeader() {},
    getHeader() {
      return undefined
    },
    appendHeader() {},
    removeHeader() {},
    headersSent: false,
  }
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

void test("a @Public() route is allowed without any token", async () => {
  const handler = () => undefined
  Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler)
  const allowed = await makeGuard().canActivate(ctx({}, handler))
  assert.equal(allowed, true)
})

void test("an anonymous request (no token) is rejected with 401", async () => {
  await assert.rejects(
    () => makeGuard().canActivate(ctx()),
    (err: unknown) => err instanceof UnauthorizedException
  )
})

void test("a malformed/corrupt bearer token is rejected with 401 (not 500)", async () => {
  for (const token of ["garbage.token.here", "a.b.c"]) {
    await assert.rejects(
      () => makeGuard().canActivate(ctx({ authorization: `Bearer ${token}` })),
      (err: unknown) => err instanceof UnauthorizedException,
      `token "${token}" should 401`
    )
  }
})
