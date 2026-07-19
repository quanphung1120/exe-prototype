import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { ScheduleModule } from "@nestjs/schedule"
import { TerminusModule } from "@nestjs/terminus"
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler"

import { AllExceptionsFilter } from "./common/all-exceptions.filter.js"
import { ClerkAuthGuard } from "./common/clerk-auth.guard.js"
import { validateEnv } from "./env.validation.js"
import { AccountModule } from "./features/account/account.module.js"
import { AssessmentModule } from "./features/assessment/assessment.module.js"
import { BookingsModule } from "./features/bookings/bookings.module.js"
import { CourtsModule } from "./features/courts/courts.module.js"
import { HealthController } from "./features/health/health.controller.js"
import { PaymentsModule } from "./features/payments/payments.module.js"
import { PlayersModule } from "./features/players/players.module.js"
import { SeedModule } from "./features/seed/seed.module.js"
import { SessionsModule } from "./features/sessions/sessions.module.js"
import { StreamModule } from "./features/stream/stream.module.js"
import { VenuesModule } from "./features/venues/venues.module.js"

@Module({
  imports: [
    // Loads `.env` into process.env once, globally — so ConfigService (and the
    // Clerk keys read by @clerk/express) are available everywhere. `validate`
    // runs the whole env through a zod schema at boot, so a missing/blank
    // required var (e.g. CLERK_SECRET_KEY) crashes the process immediately
    // instead of only failing the first request that touches it.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // MongoDB via Mongoose. The connection string is read from the config so the
    // whole app shares a single pool (see the techniques/mongodb docs).
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>("DATABASE_URL"),
        // Fail fast when the cluster is unreachable rather than hanging requests.
        serverSelectionTimeoutMS: 8000,
      }),
    }),
    // Global request rate limit, applied per-IP. Guards the open /health probe
    // and the Clerk JWKS-verification path on every route from abuse.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    // Backs the /health/ready readiness probe (MongooseHealthIndicator).
    TerminusModule,
    // Drives the Phase 5 booking sweeper (expire unpaid holds, auto-confirm
    // past the SLA, auto-complete finished checked-in bookings) — see
    // `features/payments/bookings-sweeper.service.ts`.
    ScheduleModule.forRoot(),
    BookingsModule,
    CourtsModule,
    PlayersModule,
    SessionsModule,
    AssessmentModule,
    VenuesModule,
    AccountModule,
    StreamModule,
    PaymentsModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: the throttler runs first so it rate-limits even
    // unauthenticated/rejected requests, then the Clerk auth guard (skips
    // @Public routes), then the `{ error }` filter for anything thrown.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
