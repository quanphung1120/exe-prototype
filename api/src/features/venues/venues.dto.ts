import { PartialType } from "@nestjs/mapped-types"
import { Type } from "class-transformer"
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

import { COURT_BLOCK_REASONS } from "../../shared/index.js"
import type { CourtBlockReason, SportKey } from "../../shared/index.js"

/** `?venue=` selects which venue's bundle to read; optional → defaults to first. */
export class VenueQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  venue?: string
}

/** `?venue=` is required for the raw bundle (unknown id → 404, no fallback). */
export class BundleQueryDto {
  @IsString()
  @IsNotEmpty()
  venue: string
}

const SPORTS = ["badminton"] as const
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

export class VenuePatchDto extends PartialType(VenueInputDto) {
  /** Archive (decision #11) or `false` to restore; guarded on future bookings. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean
}

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

export class CourtPatchDto extends PartialType(CourtInputDto) {
  /** Archive (decision #11) or `false` to restore; guarded on future bookings. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean
}

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

// ── Court blocks (decision #12) ─────────────────────────────────────────────

export class CourtBlockInputDto {
  @IsString()
  @IsNotEmpty()
  courtId: string

  @IsString()
  @IsNotEmpty()
  dateKey: string

  @Matches(HHMM, { message: "start: Expected HH:MM" })
  start: string

  @IsInt()
  @Min(15)
  @Max(MAX_DURATION_MIN)
  durationMin: number

  /** Always required — never inferred (VienTD-Review decision #12). */
  @IsIn(COURT_BLOCK_REASONS)
  reason: CourtBlockReason

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string
}

// Branch-scoped params: the venue (branch) id is carried in the path now that
// an account's brand may own many venues (chi nhánh), plus the nested resource
// id where the route targets one.
export class VenueIdParamDto {
  @IsString()
  @IsNotEmpty()
  venueId: string
}

export class VenueCourtParamDto {
  @IsString()
  @IsNotEmpty()
  venueId: string

  @IsString()
  @IsNotEmpty()
  courtId: string
}

export class VenueReservationParamDto {
  @IsString()
  @IsNotEmpty()
  venueId: string

  @IsString()
  @IsNotEmpty()
  reservationId: string
}

export class VenueBlockParamDto {
  @IsString()
  @IsNotEmpty()
  venueId: string

  @IsString()
  @IsNotEmpty()
  blockId: string
}
