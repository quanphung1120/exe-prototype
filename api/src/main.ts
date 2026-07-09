import "reflect-metadata"

import { RequestMethod } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"

import { AppModule } from "./app.module.js"

// Explicit request-body cap. Express's own default (100kb) already applies,
// but making it explicit documents the limit and lets it be tuned in one
// place instead of relying on an implicit framework default.
const JSON_BODY_LIMIT = "100kb"

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  app.useBodyParser("json", { limit: JSON_BODY_LIMIT })
  app.useBodyParser("urlencoded", { limit: JSON_BODY_LIMIT, extended: true })

  // Listen for SIGTERM/SIGINT (container stop, Ctrl-C) and run each module's
  // onModuleDestroy — including closing the Mongoose connection — instead of
  // dropping in-flight requests when the process is killed.
  app.enableShutdownHooks()

  // Every route lives under /api/* except the open /health liveness and
  // /health/ready readiness probes.
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  })

  // The web app lives on a different origin (port), so CORS reflects the exact
  // web origin and allows credentials (a wildcard is incompatible with those).
  app.enableCors({
    origin: config.get<string>("WEB_URL") ?? "http://localhost:3000",
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })

  const port = Number(config.get<string>("PORT") ?? 6969)
  await app.listen(port)
  console.log(`API listening on http://localhost:${port}`)
}

void bootstrap()
