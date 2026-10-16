import { Type } from "class-transformer"
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator"

import { PayoutDto } from "../brands/payout.dto.js"

/** `:id` path param of every booking payment route. */
export class BookingIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}

/** `POST /api/bookings/:id/payment/start` — optionally with a discount code. */
export class StartPaymentDto {
  /** Optional mã giảm giá — re-validated server-side against the booking's price. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  discountCode?: string
}

/** `POST /api/bookings/:id/payment/submit` — the transfer screenshot + where to refund. */
export class SubmitPaymentProofDto {
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  proofUrl: string

  /** The player's account a refund goes to; also saved to their profile. */
  @ValidateNested()
  @Type(() => PayoutDto)
  refundAccount: PayoutDto
}

/** `POST /api/bookings/:id/refund/complete` — the venue's refund screenshot. */
export class CompleteRefundDto {
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  proofUrl: string

  /** Less than the full amount when the venue and player agreed so. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount?: number
}

/** `POST /api/bookings/:id/refund/confirm` — did the refund arrive? */
export class ConfirmRefundDto {
  @IsIn(["received", "not_received"])
  result: "received" | "not_received"
}
