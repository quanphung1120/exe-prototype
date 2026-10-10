import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator"

/** `POST /api/wallet/withdrawals` — how much to take out and where to send it. */
export class WithdrawDto {
  @IsInt()
  @Min(1, {
    message: "Số tiền rút phải lớn hơn 0",
  })
  amount: number

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  bankName: string

  @Matches(/^\d{6,20}$/, { message: "Số tài khoản chỉ gồm 6–20 chữ số" })
  accountNumber: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  accountHolder: string
}

/** Admin: the transfer reference once the money was sent. */
export class CompleteWithdrawalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ref: string
}

/** Admin: why a withdrawal was refused. */
export class RejectWithdrawalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  note: string
}

export class WithdrawalIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
