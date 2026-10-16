import { Transform } from "class-transformer"
import { IsString, Matches } from "class-validator"

/** Upper-case, accent-free text — how a banking app shows an account holder. */
export function toBankAccountName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/** The bank account a venue owner wants players to pay into. */
export class PayoutDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Mã ngân hàng không hợp lệ" })
  bankBin: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.replace(/\s+/g, "") : value
  )
  @Matches(/^\d{6,20}$/, { message: "Số tài khoản chỉ gồm 6–20 chữ số" })
  accountNo: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? toBankAccountName(value) : value
  )
  @Matches(/^[A-Z ]{2,60}$/, {
    message: "Tên chủ tài khoản chỉ gồm chữ cái, 2–60 ký tự",
  })
  accountName: string
}
