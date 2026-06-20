import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import * as z from "zod"

import {
  addCourt,
  createVenue,
  getVenue,
  listVenues,
  removeCourt,
  removeVenue,
  updateCourt,
  updateVenue,
} from "../store/venue-store.js"

const sportEnum = z.enum(["tennis", "pickleball", "badminton"])
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM")

const venueInput = z.object({
  name: z.string().min(2).max(60),
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
  state: z
    .enum(["available", "in-play", "upcoming", "maintenance"])
    .optional(),
})
const courtPatch = courtInput.partial()

const idParam = z.object({ id: z.string().min(1) })
const courtParam = z.object({
  id: z.string().min(1),
  courtId: z.string().min(1),
})

// Venue management (operator-owned CRUD). Chained for RPC type inference; the
// records are held in the in-memory venue store.
export const venues = new Hono()
  .get("/", (c) => c.json(listVenues()))
  .post("/", zValidator("json", venueInput), (c) =>
    c.json(createVenue(c.req.valid("json")), 201)
  )
  .get("/:id", zValidator("param", idParam), (c) => {
    const venue = getVenue(c.req.valid("param").id)
    if (!venue) throw new HTTPException(404, { message: "Venue not found" })
    return c.json(venue)
  })
  .put(
    "/:id",
    zValidator("param", idParam),
    zValidator("json", venuePatch),
    (c) => {
      const venue = updateVenue(c.req.valid("param").id, c.req.valid("json"))
      if (!venue) throw new HTTPException(404, { message: "Venue not found" })
      return c.json(venue)
    }
  )
  .delete("/:id", zValidator("param", idParam), (c) => {
    const result = removeVenue(c.req.valid("param").id)
    if (result === "not-found")
      throw new HTTPException(404, { message: "Venue not found" })
    if (result === "last")
      throw new HTTPException(400, {
        message: "Cannot delete the only venue",
      })
    return c.json({ ok: true })
  })
  // ── Courts (scoped to a venue) ──
  .post(
    "/:id/courts",
    zValidator("param", idParam),
    zValidator("json", courtInput),
    (c) => {
      const court = addCourt(c.req.valid("param").id, c.req.valid("json"))
      if (!court) throw new HTTPException(404, { message: "Venue not found" })
      return c.json(court, 201)
    }
  )
  .put(
    "/:id/courts/:courtId",
    zValidator("param", courtParam),
    zValidator("json", courtPatch),
    (c) => {
      const { id, courtId } = c.req.valid("param")
      const court = updateCourt(id, courtId, c.req.valid("json"))
      if (!court) throw new HTTPException(404, { message: "Court not found" })
      return c.json(court)
    }
  )
  .delete("/:id/courts/:courtId", zValidator("param", courtParam), (c) => {
    const { id, courtId } = c.req.valid("param")
    if (!removeCourt(id, courtId))
      throw new HTTPException(404, { message: "Court not found" })
    return c.json({ ok: true })
  })
