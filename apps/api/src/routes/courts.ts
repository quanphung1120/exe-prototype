import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import * as z from "zod"

import { COURTS } from "../data/player.js"

// Sports supported by SportMatch (mirrors the shared `SportKey` union).
const sportEnum = z.enum(["pickleball", "badminton"])

const listCourtsQuery = z.object({
  // Query values arrive as strings, so coerce + constrain.
  sport: sportEnum.optional(),
})

const courtParam = z.object({
  id: z.string().min(1),
})

// Handlers are chained so Hono's RPC type inference flows through to the
// `AppType` exported from index.ts. Keep this as one expression.
export const courts = new Hono()
  .get("/", zValidator("query", listCourtsQuery), (c) => {
    const { sport } = c.req.valid("query")
    const data = sport
      ? COURTS.filter((court) => court.sports.includes(sport))
      : COURTS
    return c.json({ data, filter: { sport: sport ?? null } })
  })
  .get("/:id", zValidator("param", courtParam), (c) => {
    const { id } = c.req.valid("param")
    const court = COURTS.find((x) => x.id === id)
    if (!court) throw new HTTPException(404, { message: "Court not found" })
    return c.json(court)
  })
