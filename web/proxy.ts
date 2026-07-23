import { clerkMiddleware } from "@clerk/nextjs/server"
import createMiddleware from "next-intl/middleware"

import { routing } from "./i18n/routing"

// Next.js 16 renamed the `middleware` file convention to `proxy`. Clerk wraps
// the next-intl middleware so both auth and locale routing run on every match.
const handleIntl = createMiddleware(routing)

// `clerkMiddleware` must run so `auth()`/`currentUser()` work in server
// components (the dashboard guards itself there). We don't gate routes here, so
// the first callback arg is unused — locale routing is delegated to next-intl.
export default clerkMiddleware((_auth, req) => {
  return handleIntl(req)
})

export const config = {
  matcher: [
    // Match all pathnames except API routes, Next.js internals, and files
    // containing a dot (e.g. favicon.ico, images, fonts).
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
}
