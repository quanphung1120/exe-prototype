import { handle } from "hono/vercel"

// @ts-ignore — resolved at build time: `vercel.json`'s buildCommand runs
// `turbo run build --filter=api` (tsc) before this function is bundled, so
// `../dist/app.js` exists. Importing the compiled output (real .js files all the
// way down) keeps Vercel's Edge bundler from having to resolve the NodeNext
// `.js` specifiers back to `.ts` sources. `@ts-ignore` (not `@ts-expect-error`)
// because whether `dist/` exists depends on build state, not code correctness.
import app from "../dist/app.js"

// Serve the whole Hono app as a single Vercel Edge Function. `handle` is a
// thin Web-standard adapter (`req => app.fetch(req)`); every request is routed
// here by the catch-all rewrite in `vercel.json`, and Hono dispatches on the
// original path. The Node dev server lives in `src/index.ts`.
export const config = {
  runtime: "edge",
}

export default handle(app)
