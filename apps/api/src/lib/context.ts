import { getAuth } from "@clerk/hono"

import type { Context } from "hono"

import { UnauthorizedError } from "./errors.js"

/**
 * The signed-in Clerk user id. The global `/api/*` guard (app.ts) already
 * rejected anonymous callers, so getAuth is populated by the time a controller
 * runs — this re-read just narrows the id (and defends with a 401 if somehow
 * missing, e.g. a route mounted outside the guard).
 */
export function requireUserId(c: Context): string {
  const userId = getAuth(c)?.userId
  if (!userId) throw new UnauthorizedError()
  return userId
}
