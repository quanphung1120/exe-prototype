import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common"
import * as z from "zod"

import { ZodValidationPipe } from "../../common/zod-validation.pipe.js"
import {
  VenuesService,
  type CourtInput,
  type CustomerInput,
  type RescheduleReservationInput,
  type VenueInput,
  type WalkInReservationInput,
} from "./venues.service.js"

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
const reservationStatusInput = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "checked-in",
    "completed",
    "cancelled",
    "no-show",
  ]),
})
const rescheduleInput = z.object({
  dayKey: z.string().min(1),
  start: time,
  durationMin: z.number().int().min(15).max(24 * 60),
})
const customerInput = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(6).max(30),
  favoriteSport: sportEnum,
})

const idParam = z.object({ id: z.string().min(1) })
const courtParam = z.object({
  id: z.string().min(1),
  courtId: z.string().min(1),
})
const reservationParam = z.object({
  id: z.string().min(1),
  reservationId: z.string().min(1),
})

// Venue management (operator-owned CRUD), mounted at /api/venues. The service
// throws domain exceptions (NotFound, BadRequest, Conflict, …) for every failure,
// which the central filter maps to the right status — so these methods just call
// and shape the success response. POST → 201 by Nest default.
@Controller("venues")
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get()
  list() {
    return this.venues.listVenues()
  }

  @Post()
  create(@Body(new ZodValidationPipe(venueInput)) body: VenueInput) {
    return this.venues.createVenue(body)
  }

  @Get(":id")
  get(@Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>) {
    return this.venues.getVenue(param.id)
  }

  @Put(":id")
  update(
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(venuePatch)) body: Partial<VenueInput>
  ) {
    return this.venues.updateVenue(param.id, body)
  }

  @Delete(":id")
  async remove(
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>
  ) {
    await this.venues.removeVenue(param.id)
    return { ok: true }
  }

  // ── Courts (scoped to a venue) ──
  @Post(":id/courts")
  addCourt(
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(courtInput)) body: CourtInput
  ) {
    return this.venues.addCourt(param.id, body)
  }

  @Put(":id/courts/:courtId")
  updateCourt(
    @Param(new ZodValidationPipe(courtParam)) param: z.infer<typeof courtParam>,
    @Body(new ZodValidationPipe(courtPatch)) body: Partial<CourtInput>
  ) {
    return this.venues.updateCourt(param.id, param.courtId, body)
  }

  @Delete(":id/courts/:courtId")
  async removeCourt(
    @Param(new ZodValidationPipe(courtParam)) param: z.infer<typeof courtParam>
  ) {
    await this.venues.removeCourt(param.id, param.courtId)
    return { ok: true }
  }

  // ── Reservations (scoped to a venue) ──
  @Post(":id/reservations/walk-in")
  addWalkIn(
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(walkInInput)) body: WalkInReservationInput
  ) {
    return this.venues.addWalkInReservation(param.id, body)
  }

  @Put(":id/reservations/:reservationId/status")
  updateReservationStatus(
    @Param(new ZodValidationPipe(reservationParam))
    param: z.infer<typeof reservationParam>,
    @Body(new ZodValidationPipe(reservationStatusInput))
    body: z.infer<typeof reservationStatusInput>
  ) {
    return this.venues.updateReservationStatus(
      param.id,
      param.reservationId,
      body.status
    )
  }

  @Put(":id/reservations/:reservationId")
  rescheduleReservation(
    @Param(new ZodValidationPipe(reservationParam))
    param: z.infer<typeof reservationParam>,
    @Body(new ZodValidationPipe(rescheduleInput))
    body: RescheduleReservationInput
  ) {
    return this.venues.rescheduleReservation(
      param.id,
      param.reservationId,
      body
    )
  }

  // ── Customers (scoped to a venue) ──
  @Post(":id/customers")
  addCustomer(
    @Param(new ZodValidationPipe(idParam)) param: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(customerInput)) body: CustomerInput
  ) {
    return this.venues.addCustomer(param.id, body)
  }
}
