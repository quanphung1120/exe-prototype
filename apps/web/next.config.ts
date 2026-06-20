import path from "node:path"

import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const nextConfig: NextConfig = {
  // Monorepo layout: this app lives at apps/web while the pnpm lockfile lives at
  // the workspace root (two levels up). Pin the file-tracing root there so
  // production builds trace files relative to the monorepo, not just apps/web.
  // `import.meta.dirname` is the ESM-safe equivalent of `__dirname`.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
