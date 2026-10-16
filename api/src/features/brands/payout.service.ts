import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { BankAccount } from "../../shared/index.js"
import { BanksService } from "../banks/banks.service.js"
import { Brand, type BrandDocument } from "./brand.schema.js"
import type { PayoutDto } from "./payout.dto.js"

/**
 * The bank account a brand's players pay into (VietQR). One per brand — the
 * brand has one owner, and all its branches share the account.
 */
@Injectable()
export class PayoutService {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>,
    @Inject(BanksService) private readonly banks: BanksService
  ) {}

  /** The owner's account, or null while none is set (or no brand yet). */
  async getPayout(userId: string): Promise<BankAccount | null> {
    const doc = await this.brandModel
      .findOne({ ownerId: userId })
      .select("payout")
      .lean<{ payout?: BankAccount }>()
    return doc?.payout ?? null
  }

  /** Save the owner's account; the bank name/code come from the VietQR list. */
  async setPayout(userId: string, dto: PayoutDto): Promise<BankAccount> {
    const bank = await this.banks.find(dto.bankBin)
    if (!bank) {
      throw new BadRequestException("Ngân hàng này chưa hỗ trợ chuyển khoản QR")
    }
    const doc = await this.brandModel.findOne({ ownerId: userId })
    if (!doc)
      throw new NotFoundException("Chưa có thương hiệu để lưu tài khoản")
    const payout: BankAccount = {
      bankBin: bank.bin,
      bankCode: bank.code,
      bankName: bank.shortName,
      accountNo: dto.accountNo,
      accountName: dto.accountName,
    }
    doc.payout = payout
    doc.markModified("payout")
    await doc.save()
    return payout
  }

  /** The account of one brand (by id) — what a booking snapshots for the QR. */
  async payoutForBrand(brandId: string): Promise<BankAccount | null> {
    const doc = await this.brandModel
      .findOne({ brandId })
      .select("payout")
      .lean<{ payout?: BankAccount }>()
    return doc?.payout ?? null
  }
}
