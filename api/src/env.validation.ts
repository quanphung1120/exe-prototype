import { z } from "zod"

// Validated once at boot by ConfigModule.forRoot({ validate }) below — an
// invalid/missing required var fails the process immediately instead of
// surfacing as a 500 on the first request that needs it (e.g. a missing
// CLERK_SECRET_KEY previously only broke the auth guard per-request).
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is required"),
  // GetStream.io Stream Chat — server key + secret. The secret signs user JWTs
  // locally (no network) and authenticates server-side channel/user upserts.
  STREAM_API_KEY: z.string().min(1, "STREAM_API_KEY is required"),
  STREAM_API_SECRET: z.string().min(1, "STREAM_API_SECRET is required"),
  // SePay payment gateway (sepay-pg-node) — VienTD-Review Phase 4. Sandbox by
  // default (pgapi-sandbox.sepay.vn); flip to "production" only against real
  // merchant credentials. Required so a missing/blank var crashes at boot
  // instead of the checkout/IPN routes 500ing on first use.
  SEPAY_ENV: z.enum(["sandbox", "production"], {
    message: 'SEPAY_ENV is required ("sandbox" or "production")',
  }),
  SEPAY_MERCHANT_ID: z.string().min(1, "SEPAY_MERCHANT_ID is required"),
  SEPAY_SECRET_KEY: z.string().min(1, "SEPAY_SECRET_KEY is required"),
  SEPAY_RETURN_URL: z.string().min(1, "SEPAY_RETURN_URL is required"),
  WEB_URL: z.string().min(1).default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(6969),
  // Booking sweeper (`bookings.sweeper.ts`) SLA — decision #5: a pending
  // reservation silently auto-confirms once the venue hasn't decided within
  // this window ("silence = consent"). Overridable so dev can shrink the
  // real 30-minute SLA to seconds/minutes when exercising the sweeper.
  BOOKING_CONFIRM_SLA_MINUTES: z.coerce.number().int().positive().default(30),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}
