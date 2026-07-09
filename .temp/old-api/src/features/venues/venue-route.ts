import { Hono } from "hono"
import * as z from "zod"

import { venueController } from "./venue-controller.js"
import { validate } from "../../lib/validate.js"

const venueQuery = z.object({ venue: z.string().min(1).optional() })
const bundleQuery = z.object({ venue: z.string().min(1) })

// Venue-workspace (operator) read resources. Route wiring only; the controller
// reads from the venue service. Chained for RPC type inference.
export const venue = new Hono()
  .get("/bundle", validate("query", bundleQuery), (c) =>
    venueController.bundle(c, c.req.valid("query"))
  )
  .get("/", validate("query", venueQuery), (c) =>
    venueController.summary(c, c.req.valid("query"))
  )
  .get("/courts", validate("query", venueQuery), (c) =>
    venueController.courts(c, c.req.valid("query"))
  )
  .get("/reservations", validate("query", venueQuery), (c) =>
    venueController.reservations(c, c.req.valid("query"))
  )
  .get("/customers", validate("query", venueQuery), (c) =>
    venueController.customers(c, c.req.valid("query"))
  )
  .get("/analytics", validate("query", venueQuery), (c) =>
    venueController.analytics(c, c.req.valid("query"))
  )
  .get("/insights", validate("query", venueQuery), (c) =>
    venueController.insights(c, c.req.valid("query"))
  )
