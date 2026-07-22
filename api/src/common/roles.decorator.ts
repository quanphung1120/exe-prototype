import { SetMetadata } from "@nestjs/common"

import type { ClerkRole } from "./request-auth.js"

// Marks a route/controller as requiring one of the given Clerk roles.
// RolesGuard reads this metadata and compares it against the role
// ClerkAuthGuard stashed on the request from the verified session token.
export const ROLES_KEY = "roles"
export const Roles = (...roles: ClerkRole[]) => SetMetadata(ROLES_KEY, roles)
