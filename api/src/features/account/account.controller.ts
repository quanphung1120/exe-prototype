import { Body, Controller, Get, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { AccountService } from "./account.service.js"
import { ChooseAccountTypeDto } from "./account.dto.js"

// The signed-in account's self-declared type (per Clerk user). A single
// per-user resource: GET reads the effective type (null until chosen), PUT
// records the user's choice once from the onboarding page.
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  async get(@UserId() userId: string) {
    return { accountType: await this.account.getAccountType(userId) }
  }

  @Put()
  async put(@UserId() userId: string, @Body() body: ChooseAccountTypeDto) {
    return {
      accountType: await this.account.chooseAccountType(
        userId,
        body.accountType
      ),
    }
  }
}
