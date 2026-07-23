import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator"

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_DURATION_MIN = 24 * 60
const DECISIONS = ["approve", "decline"] as const

/** `POST /api/bookings` — creates an unpaid `awaiting_payment` hold. */
export class CreateBookingDto {
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

  /** The forming PlaySession this hold belongs to, if booked from a room. */
  @IsOptional()
  @IsString()
  sessionId?: string
}

/** `POST /api/bookings/:id/cancel` — reason is optional (unlike a venue decline). */
export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  reason?: string
}

/** `POST /api/bookings/:id/decision` — a decline requires its reason. */
export class BookingDecisionDto {
  @IsIn(DECISIONS)
  decision: (typeof DECISIONS)[number]

  @ValidateIf((o: BookingDecisionDto) => o.decision === "decline")
  @IsString()
  @Length(3, 200)
  reason?: string
}

export class BookingIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
