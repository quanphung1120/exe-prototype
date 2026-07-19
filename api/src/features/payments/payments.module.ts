import { Module } from "@nestjs/common"

import { SepayClient } from "./sepay.client.js"

@Module({
  providers: [SepayClient],
  exports: [SepayClient],
})
export class PaymentsModule {}
