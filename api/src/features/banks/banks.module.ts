import { Module } from "@nestjs/common"

import { BanksController } from "./banks.controller.js"
import { BANKS_FETCH, BanksService, type BanksFetch } from "./banks.service.js"

@Module({
  controllers: [BanksController],
  providers: [
    BanksService,
    {
      provide: BANKS_FETCH,
      useValue: ((url, init) => fetch(url, init)) satisfies BanksFetch,
    },
  ],
  exports: [BanksService],
})
export class BanksModule {}
