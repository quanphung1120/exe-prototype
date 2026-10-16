import { IsIn, IsNotEmpty, IsString } from "class-validator"

import { ACCOUNT_TYPES, type AccountType } from "../../shared/index.js"

export class ChooseAccountTypeDto {
  @IsIn(ACCOUNT_TYPES)
  accountType: AccountType
}

export class UpdatePhoneDto {
  @IsString()
  @IsNotEmpty()
  phone: string
}
