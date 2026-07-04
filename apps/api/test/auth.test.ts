import assert from "node:assert/strict"
import { test } from "node:test"

import "dotenv/config"

import { routes } from "../src/app.js"

// Give Clerk *some* keys so the middleware can initialize its client. The paths
// under test here are all anonymous — no token → signed out — which Clerk
// resolves networklessly, so dummy keys are enough when real ones aren't set.
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy"
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_dummy"

test("GET /health is open (no auth required)", async () => {
  const res = await routes.request("/health")
  assert.equal(res.status, 200)
  const body = (await res.json()) as { status: string }
  assert.equal(body.status, "ok")
})

test("anonymous GET /api/seed is rejected with 401", async () => {
  const res = await routes.request("/api/seed")
  assert.equal(res.status, 401)
  const body = (await res.json()) as { error: string }
  assert.equal(body.error, "Unauthorized")
})

test("anonymous read GET /api/courts is rejected with 401", async () => {
  const res = await routes.request("/api/courts")
  assert.equal(res.status, 401)
})

test("a malformed/corrupt bearer token is rejected with 401 (not 500)", async () => {
  // A JWT-shaped but undecodable token makes Clerk's decode throw; the guard
  // must fold that into a clean 401 rather than a 500.
  for (const token of ["garbage.token.here", "a.b.c"]) {
    const res = await routes.request("/api/seed", {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 401, `token "${token}" should 401`)
  }
})

test("anonymous mutation POST /api/venues is rejected with 401", async () => {
  const res = await routes.request("/api/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Test Venue" }),
  })
  // Rejected by the auth guard before zod validation ever runs.
  assert.equal(res.status, 401)
})

test("CORS preflight (OPTIONS) is not blocked by the auth guard", async () => {
  const res = await routes.request("/api/seed", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
    },
  })
  // cors() short-circuits the preflight before the guard runs, so a browser can
  // complete the OPTIONS handshake without a token.
  assert.ok(res.status === 204 || res.status === 200, `got ${res.status}`)
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:3000"
  )
})
