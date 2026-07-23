import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { Request } from "express"

import { ROLES_KEY } from "./roles.decorator.js"
import { getRequestRole, type ClerkRole } from "./request-auth.js"

/**
 * Controller-scoped guard behind every `@Roles(...)` route (the admin
 * feature). Runs *after* the global `ClerkAuthGuard` (Nest evaluates global
 * guards before controller-scoped ones), which has already verified the
 * caller and stashed their role from the session token's `metadata.role`
 * claim — this just checks it matches. 403s (not 401) a signed-in caller
 * missing the required role, since they're authenticated, just not
 * authorized.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ClerkRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest<Request>()
    const role = getRequestRole(req)
    if (!role || !required.includes(role)) {
      throw new ForbiddenException("Admin access required")
    }
    return true
  }
}
