import { Transform } from "class-transformer"
import { IsInt, IsNotEmpty, IsString, Min } from "class-validator"

/** `POST /api/discounts/validate` body. */
export class ValidateDiscountDto {
  /** Trimmed + uppercased before validation so "giam10"/" GIAM10 " both match. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value
  )
  @IsString()
  @IsNotEmpty()
  code: string

  /** The order amount (VND) the code would apply to — a booking's price. */
  @IsInt()
  @Min(1)
  amount: number
}
