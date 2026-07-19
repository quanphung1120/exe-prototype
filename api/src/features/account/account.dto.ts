import { IsIn } from "class-validator"

import { ACCOUNT_TYPES, type AccountType } from "../../shared/index.js"

export class ChooseAccountTypeDto {
  @IsIn(ACCOUNT_TYPES)
  accountType: AccountType
}
