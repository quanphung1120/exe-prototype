import { Body, Controller, Post } from "@nestjs/common"

import { ValidateDiscountDto } from "./discounts.dto.js"
import { DiscountsService } from "./discounts.service.js"

// Guarded like every other route (no @Public()) — a signed-in Clerk session is
// required, but the check isn't scoped to a user (discount codes are shared
// demo data, same trust model as venues/courts).
@Controller("discounts")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post("validate")
  async validate(@Body() body: ValidateDiscountDto) {
    return this.discounts.validate(body.code, body.amount)
  }
}
