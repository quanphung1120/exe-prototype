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
  images: {
    qualities: [75, 100],
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // The player workspace moved from /dashboard to /app. Old links still point
  // at /dashboard — most importantly SePay orders whose return URLs were baked
  // in before the rename (or an api still configured with the old
  // SEPAY_RETURN_URL) — so forward them instead of landing on a 404. Query
  // strings (e.g. `?reason=cancelled`) carry over automatically.
  redirects() {
    return [
      {
        source: "/:locale(vi|en)/dashboard/:path*",
        destination: "/:locale/app/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/:path*",
        destination: "/app/:path*",
        permanent: false,
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
