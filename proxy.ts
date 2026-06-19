import createMiddleware from "next-intl/middleware"

import { routing } from "./i18n/routing"

// Next.js 16 renamed the `middleware` file convention to `proxy`. next-intl
// still ships the helper as `next-intl/middleware`; it is hosted here.
export default createMiddleware(routing)

export const config = {
  // Match all pathnames except API routes, Next.js internals, and files
  // containing a dot (e.g. favicon.ico, images, fonts).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
}
