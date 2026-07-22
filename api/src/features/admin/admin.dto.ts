import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator"

export class VenueIdParamDto {
  @IsString()
  @IsNotEmpty()
  venueId: string
}

export class BookingIdParamDto {
  @IsString()
  @IsNotEmpty()
  bookingId: string
}

export class RejectVenueDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string
}

export class SettleRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ref?: string
}

export class ForceCancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string
}

export class ListBookingsQueryDto {
  @IsOptional()
  @IsIn(["50", "100", "200", "500"])
  limit?: string
}
