import type { Request } from "express"

/** Roles a Clerk account can carry — see `Roles` (roles.decorator.ts). */
export type ClerkRole = "admin"

/**
 * Where `ClerkAuthGuard` stashes the user id (and role) after verifying the
 * Bearer token, and where `@UserId()`/`getRequestRole` read them back. We validate
 * the token directly with `verifyToken` instead of running Clerk's Express
 * middleware, so `getAuth(req)` is never populated — these symbols are our own
 * tiny replacement for it. Symbol keys keep them off the public request shape
 * and collision-free with fields owned by Express or Clerk.
 */
const USER_ID = Symbol("clerkUserId")
const ROLE = Symbol("clerkRole")

type WithUserId = Request & { [USER_ID]?: string; [ROLE]?: ClerkRole }

export function setRequestUserId(req: Request, userId: string): void {
  ;(req as WithUserId)[USER_ID] = userId
}

export function getRequestUserId(req: Request): string | undefined {
  return (req as WithUserId)[USER_ID]
}

/**
 * The caller's role, read from the Clerk session token's `metadata.role`
 * claim (see the RBAC session-token customization documented on
 * `ClerkAuthGuard`) — undefined for a plain signed-in user with no role.
 */
export function setRequestRole(req: Request, role?: ClerkRole): void {
  ;(req as WithUserId)[ROLE] = role
}

export function getRequestRole(req: Request): ClerkRole | undefined {
  return (req as WithUserId)[ROLE]
}
