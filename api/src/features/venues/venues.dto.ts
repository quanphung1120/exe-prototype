import { PartialType } from "@nestjs/mapped-types"
import { Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator"

import type { SportKey } from "../../shared/index.js"

const SPORTS = ["pickleball", "badminton"] as const
const COURT_STATES = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
] as const
const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "checked-in",
  "completed",
  "cancelled",
  "no-show",
] as const
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_DURATION_MIN = 24 * 60

export class VenueInputDto {
  @IsString()
  @Length(2, 60)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsString()
  @Length(1, 60)
  district: string

  @IsString()
  @Length(1, 60)
  city: string

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SPORTS, { each: true })
  sports: SportKey[]

  @Matches(HHMM, { message: "openFrom: Expected HH:MM" })
  openFrom: string

  @Matches(HHMM, { message: "openTo: Expected HH:MM" })
  openTo: string

  @IsString()
  @Length(2, 60)
  managerName: string
}

export class VenuePatchDto extends PartialType(VenueInputDto) {}

/** The guided setup-wizard payload: the venue profile plus its initial courts. */
export class VenueSetupDto extends VenueInputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CourtInputDto)
  courts: CourtInputDto[]
}

export class CourtInputDto {
  @IsString()
  @Length(1, 40)
  name: string

  @IsIn(SPORTS)
  sport: SportKey

  @IsString()
  @Length(1, 40)
  surface: string

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  pricePerHour: number

  @IsOptional()
  @IsIn(COURT_STATES)
  state?: (typeof COURT_STATES)[number]
}

export class CourtPatchDto extends PartialType(CourtInputDto) {}

export class WalkInInputDto {
  @IsString()
  @IsNotEmpty()
  courtId: string

  @IsString()
  @IsNotEmpty()
  dayKey: string

  @Matches(HHMM, { message: "start: Expected HH:MM" })
  start: string

  @IsInt()
  @Min(15)
  @Max(MAX_DURATION_MIN)
  durationMin: number

  @IsString()
  @Length(2, 80)
  customerName: string

  @IsString()
  @Length(6, 30)
  customerPhone: string
}

export class ReservationStatusDto {
  @IsIn(RESERVATION_STATUSES)
  status: (typeof RESERVATION_STATUSES)[number]

  /** Required whenever the operator moves a reservation to "cancelled". */
  @ValidateIf((o: ReservationStatusDto) => o.status === "cancelled")
  @IsString()
  @Length(3, 200)
  reason?: string
}

export class RescheduleDto {
  @IsString()
  @IsNotEmpty()
  dayKey: string

  @Matches(HHMM, { message: "start: Expected HH:MM" })
  start: string

  @IsInt()
  @Min(15)
  @Max(MAX_DURATION_MIN)
  durationMin: number
}

export class CustomerDto {
  @IsString()
  @Length(2, 80)
  name: string

  @IsString()
  @Length(6, 30)
  phone: string

  @IsIn(SPORTS)
  favoriteSport: SportKey
}

export class IdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}

export class CourtParamDto {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  courtId: string
}

export class ReservationParamDto {
  @IsString()
  @IsNotEmpty()
  id: string

  @IsString()
  @IsNotEmpty()
  reservationId: string
}

// Owner-scoped params (the venue is resolved from the caller, not the path).
export class CourtIdParamDto {
  @IsString()
  @IsNotEmpty()
  courtId: string
}

export class ReservationIdParamDto {
  @IsString()
  @IsNotEmpty()
  reservationId: string
}
