import { Controller, Get } from "@nestjs/common"

import { Public } from "../../common/public.decorator.js"

// Liveness check, left open (no Clerk session) for uptime probes. Excluded from
// the global `api` prefix in main.ts, so it lives at /health.
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: "ok", uptime: process.uptime(), hotReloadTest: false }
  }
}
