import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { BankAccount } from "../../shared/index.js"
import { BanksService } from "../banks/banks.service.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
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
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>,
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

  /** A validated account: the bank name/code come from the VietQR list. */
  async toAccount(dto: PayoutDto): Promise<BankAccount> {
    const bank = await this.banks.find(dto.bankBin)
    if (!bank) {
      throw new BadRequestException("Ngân hàng này chưa hỗ trợ chuyển khoản QR")
    }
    return {
      bankBin: bank.bin,
      bankCode: bank.code,
      bankName: bank.shortName,
      accountNo: dto.accountNo,
      accountName: dto.accountName,
    }
  }

  /** Save the owner's account. */
  async setPayout(userId: string, dto: PayoutDto): Promise<BankAccount> {
    const payout = await this.toAccount(dto)
    const doc = await this.brandModel.findOne({ ownerId: userId })
    if (!doc)
      throw new NotFoundException("Chưa có thương hiệu để lưu tài khoản")
    doc.payout = payout
    doc.markModified("payout")
    await doc.save()
    return payout
  }

  /** The account players of `venueId` pay into: its brand's, or null when unset. */
  async payoutForVenue(venueId: string): Promise<BankAccount | null> {
    const venue = await this.venueModel
      .findOne({ venueId })
      .select("brandId ownerId")
      .lean<{ brandId?: string; ownerId?: string }>()
    if (!venue) return null
    if (venue.brandId) return this.payoutForBrand(venue.brandId)
    return venue.ownerId ? this.getPayout(venue.ownerId) : null
  }

  /** Throws unless the venue has an account — online booking needs somewhere to pay. */
  async assertAcceptsOnline(venueId: string): Promise<void> {
    if (!(await this.payoutForVenue(venueId))) {
      throw new ConflictException(
        "Sân này chưa khai báo tài khoản nhận tiền nên chưa nhận đặt trực tuyến"
      )
    }
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
