import { SetMetadata } from "@nestjs/common"

// Marks a route as open (no Clerk session required). The global ClerkAuthGuard
// checks for this metadata and skips the auth check — used for /health.
export const IS_PUBLIC_KEY = "isPublic"
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
