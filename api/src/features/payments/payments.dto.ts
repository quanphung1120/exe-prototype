import { IsNotEmpty, IsOptional, IsString } from "class-validator"

/** `POST /api/payments/checkout` — the app booking to start a SePay checkout for. */
export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  bookingId: string

  /** Optional mã giảm giá — re-validated server-side against the booking's price. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  discountCode?: string
}

/** `GET /api/payments/by-booking/:id` path param. */
export class BookingIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
