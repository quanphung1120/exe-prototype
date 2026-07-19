import { Controller, Get } from "@nestjs/common"
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from "@nestjs/terminus"

import { Public } from "../../common/public.decorator.js"

// Both routes are open (no Clerk session) for uptime/orchestration probes.
// Excluded from the global `api` prefix in main.ts, so they live at /health
// and /health/ready rather than /api/health*.
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator
  ) {}

  // Liveness: the process is up and answering HTTP. Doesn't touch Mongo, so
  // it stays healthy even during a DB outage — orchestrators shouldn't kill
  // and restart the container for a dependency issue, only readiness should
  // flip.
  @Public()
  @Get()
  liveness() {
    return { status: "ok", uptime: process.uptime() }
  }

  // Readiness: can this instance actually serve traffic right now? Pings the
  // shared Mongoose connection so a load balancer/orchestrator can pull the
  // instance out of rotation while the DB is unreachable instead of routing
  // requests that will fail.
  @Public()
  @Get("ready")
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.mongoose.pingCheck("mongo")])
  }
}
