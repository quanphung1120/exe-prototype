import { Hono } from "hono"
import * as z from "zod"

import { courtController } from "../controllers/court-controller.js"
import { validate } from "../validate.js"

// Sports supported by SportMatch (mirrors the shared `SportKey` union).
const sportEnum = z.enum(["pickleball", "badminton"])

const listCourtsQuery = z.object({
  sport: sportEnum.optional(),
})

const courtParam = z.object({
  id: z.string().min(1),
})

// Route wiring only: paths + input validation, delegating to the controller.
// Handlers are chained inline so Hono's RPC type inference flows through to the
// `AppType` exported from app.ts.
export const courts = new Hono()
  .get("/", validate("query", listCourtsQuery), (c) =>
    courtController.list(c, c.req.valid("query"))
  )
  .get("/:id", validate("param", courtParam), (c) =>
    courtController.get(c, c.req.valid("param"))
  )
