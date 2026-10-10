import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator"

import { TOPUP_MAX, TOPUP_MIN } from "../../shared/index.js"

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

/** `POST /api/payments/wallet-pay` — pay an app booking hold from the wallet. */
export class WalletPayDto {
  @IsString()
  @IsNotEmpty()
  bookingId: string

  /** Optional mã giảm giá — re-validated server-side against the booking's price. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  discountCode?: string
}

/** `POST /api/wallet/topups` — how much to add to the wallet. */
export class TopUpDto {
  @IsInt()
  @Min(TOPUP_MIN)
  @Max(TOPUP_MAX)
  amount: number
}

/** `GET /api/wallet/topups/:id` path param. */
export class TopUpIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
