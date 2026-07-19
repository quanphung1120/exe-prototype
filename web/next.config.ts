import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const securityHeaders = [
  // HSTS: force HTTPS on repeat visits once this is served over TLS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No legacy MIME-sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't allow this app to be framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Send only the origin on cross-origin navigations, full URL same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser APIs this app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
