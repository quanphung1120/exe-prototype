import { IsNotEmpty, IsString } from "class-validator"

/** `POST /api/payments/checkout` — the app booking to start a SePay checkout for. */
export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  bookingId: string
}

/** `GET /api/payments/by-booking/:id` path param. */
export class BookingIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
