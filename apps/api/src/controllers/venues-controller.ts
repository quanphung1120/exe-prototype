import type { Context } from "hono"

import {
  addCourt,
  addWalkInReservation,
  createVenue,
  getVenue,
  listVenues,
  removeCourt,
  removeVenue,
  updateCourt,
  updateVenue,
  type CourtInput,
  type VenueInput,
  type WalkInReservationInput,
} from "../services/venue-service.js"

// Venue management (operator-owned CRUD), backed by the venue service. The
// service throws domain errors (NotFoundError, BadRequestError, …) for every
// failure, which the central onError (app.ts) maps to the right status — so
// these methods just call and shape the success response. Route wiring + zod
// validation live in routes/venues.ts.
export const venuesController = {
  async list(c: Context) {
    return c.json(await listVenues())
  },

  async create(c: Context, input: VenueInput) {
    return c.json(await createVenue(input), 201)
  },

  async get(c: Context, param: { id: string }) {
    return c.json(await getVenue(param.id))
  },

  async update(c: Context, param: { id: string }, patch: Partial<VenueInput>) {
    return c.json(await updateVenue(param.id, patch))
  },

  async remove(c: Context, param: { id: string }) {
    await removeVenue(param.id)
    return c.json({ ok: true })
  },

  // ── Courts (scoped to a venue) ──
  async addCourt(c: Context, param: { id: string }, input: CourtInput) {
    return c.json(await addCourt(param.id, input), 201)
  },

  async updateCourt(
    c: Context,
    param: { id: string; courtId: string },
    patch: Partial<CourtInput>
  ) {
    return c.json(await updateCourt(param.id, param.courtId, patch))
  },

  async removeCourt(c: Context, param: { id: string; courtId: string }) {
    await removeCourt(param.id, param.courtId)
    return c.json({ ok: true })
  },

  async addWalkIn(
    c: Context,
    param: { id: string },
    input: WalkInReservationInput
  ) {
    return c.json(await addWalkInReservation(param.id, input), 201)
  },
}
