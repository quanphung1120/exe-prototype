import type { Request } from "express"

/**
 * Where `ClerkAuthGuard` stashes the user id after verifying the Bearer token,
 * and where `@UserId()` reads it back. We validate the token directly with
 * `verifyToken` instead of running Clerk's Express middleware, so `getAuth(req)`
 * is never populated — this symbol is our own tiny replacement for it. A symbol
 * key keeps it off the public request shape and collision-free with fields
 * owned by Express or Clerk.
 */
const USER_ID = Symbol("clerkUserId")

type WithUserId = Request & { [USER_ID]?: string }

export function setRequestUserId(req: Request, userId: string): void {
  ;(req as WithUserId)[USER_ID] = userId
}

export function getRequestUserId(req: Request): string | undefined {
  return (req as WithUserId)[USER_ID]
}
