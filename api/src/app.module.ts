import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"

import { AllExceptionsFilter } from "./common/all-exceptions.filter.js"
import { ClerkAuthGuard } from "./common/clerk-auth.guard.js"
import { AssessmentModule } from "./features/assessment/assessment.module.js"
import { CourtsModule } from "./features/courts/courts.module.js"
import { HealthController } from "./features/health/health.controller.js"
import { PlayersModule } from "./features/players/players.module.js"
import { SeedModule } from "./features/seed/seed.module.js"
import { SessionsModule } from "./features/sessions/sessions.module.js"
import { VenuesModule } from "./features/venues/venues.module.js"

@Module({
  imports: [
    // Loads `.env` into process.env once, globally — so ConfigService (and the
    // Clerk keys read by @clerk/express) are available everywhere.
    ConfigModule.forRoot({ isGlobal: true }),
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
    CourtsModule,
    PlayersModule,
    SessionsModule,
    AssessmentModule,
    VenuesModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global Clerk auth guard (skips @Public routes) and the `{ error }` filter.
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
