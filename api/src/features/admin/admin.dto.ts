import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator"

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

const normalizeCode = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toUpperCase() : value

export class DiscountCodeParamDto {
  @Transform(normalizeCode)
  @IsString()
  @IsNotEmpty()
  code: string
}

export class CreateDiscountDto {
  @Transform(normalizeCode)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Z0-9]+$/, {
    message: "Mã chỉ gồm chữ không dấu và số",
  })
  code: string

  @IsIn(["percent", "fixed"])
  type: "percent" | "fixed"

  @IsInt()
  @Min(1)
  value: number

  @IsOptional() @IsInt() @Min(1) maxDiscount?: number
  @IsOptional() @IsInt() @Min(1) minOrder?: number
  @IsOptional() @IsISO8601() validFrom?: string
  @IsOptional() @IsISO8601() validUntil?: string
  @IsOptional() @IsInt() @Min(1) usageLimit?: number
  @IsOptional() @IsInt() @Min(1) perUserLimit?: number
  @IsOptional() @IsBoolean() active?: boolean

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string
}

export class UpdateDiscountDto {
  @IsOptional() @IsIn(["percent", "fixed"]) type?: "percent" | "fixed"
  @IsOptional() @IsInt() @Min(1) value?: number
  @IsOptional() @IsInt() @Min(1) maxDiscount?: number
  @IsOptional() @IsInt() @Min(1) minOrder?: number
  @IsOptional() @IsISO8601() validFrom?: string
  @IsOptional() @IsISO8601() validUntil?: string
  @IsOptional() @IsInt() @Min(1) usageLimit?: number
  @IsOptional() @IsInt() @Min(1) perUserLimit?: number
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description?: string
}
