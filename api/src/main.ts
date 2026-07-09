import "reflect-metadata"

import { RequestMethod } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "./app.module.js"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  // Every route lives under /api/* except the open /health liveness probe.
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
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
