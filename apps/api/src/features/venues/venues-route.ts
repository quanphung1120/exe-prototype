import { Hono } from "hono"
import * as z from "zod"

import { venuesController } from "./venues-controller.js"
import { validate } from "../../lib/validate.js"

const sportEnum = z.enum(["pickleball", "badminton"])
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM")

const venueInput = z.object({
  name: z.string().min(2).max(60),
  image: z.string().max(2048).optional(),
  description: z.string().max(500).optional(),
  district: z.string().min(1).max(60),
  city: z.string().min(1).max(60),
  sports: z.array(sportEnum).min(1),
  openFrom: time,
  openTo: time,
  managerName: z.string().min(2).max(60),
})
const venuePatch = venueInput.partial()

const courtInput = z.object({
  name: z.string().min(1).max(40),
  sport: sportEnum,
  surface: z.string().min(1).max(40),
  pricePerHour: z.number().int().min(0).max(100_000_000),
  state: z.enum(["available", "in-play", "upcoming", "maintenance"]).optional(),
})
const courtPatch = courtInput.partial()
const walkInInput = z.object({
  courtId: z.string().min(1),
  dayKey: z.string().min(1),
  start: time,
  durationMin: z.number().int().min(15).max(24 * 60),
  customerName: z.string().min(2).max(80),
  customerPhone: z.string().min(6).max(30),
})

const idParam = z.object({ id: z.string().min(1) })
const courtParam = z.object({
  id: z.string().min(1),
  courtId: z.string().min(1),
})

// Venue management (operator-owned CRUD). Route wiring + input validation only;
// the controller maps service results to HTTP. Chained for RPC type inference.
export const venues = new Hono()
  .get("/", (c) => venuesController.list(c))
  .post("/", validate("json", venueInput), (c) =>
    venuesController.create(c, c.req.valid("json"))
  )
  .get("/:id", validate("param", idParam), (c) =>
    venuesController.get(c, c.req.valid("param"))
  )
  .put(
    "/:id",
    validate("param", idParam),
    validate("json", venuePatch),
    (c) => venuesController.update(c, c.req.valid("param"), c.req.valid("json"))
  )
  .delete("/:id", validate("param", idParam), (c) =>
    venuesController.remove(c, c.req.valid("param"))
  )
  // ── Courts (scoped to a venue) ──
  .post(
    "/:id/courts",
    validate("param", idParam),
    validate("json", courtInput),
    (c) => venuesController.addCourt(c, c.req.valid("param"), c.req.valid("json"))
  )
  .put(
    "/:id/courts/:courtId",
    validate("param", courtParam),
    validate("json", courtPatch),
    (c) =>
      venuesController.updateCourt(
        c,
        c.req.valid("param"),
        c.req.valid("json")
      )
  )
  .delete("/:id/courts/:courtId", validate("param", courtParam), (c) =>
    venuesController.removeCourt(c, c.req.valid("param"))
  )
  .post(
    "/:id/reservations/walk-in",
    validate("param", idParam),
    validate("json", walkInInput),
    (c) => venuesController.addWalkIn(c, c.req.valid("param"), c.req.valid("json"))
  )
