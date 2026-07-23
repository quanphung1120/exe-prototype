import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { initialsOf, type Brand as BrandInfo } from "../../shared/index.js"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import { Brand, type BrandDocument } from "./brand.schema.js"

/** The profile fields captured when a brand is first provisioned. */
export interface BrandInput {
  name: string
  image?: string
  description?: string
}

/** Largest numeric suffix among ids shaped `${prefix}<n>` (0 when none match). */
function maxSeq(ids: string[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  return ids.reduce((max, id) => {
    const m = re.exec(id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

// MongoDB-backed brand service. A brand is the account-owned root that groups an
// operator's venue branches; unlike venues it carries no demo seed — ownerless
// demo venues simply have no brand. VenuesService.provisionVenue calls
// `ensureBrand` so the first branch also mints the brand, and later branches
// reuse it. Depends on nothing else, so it stays out of any module cycle.
@Injectable()
export class BrandsService {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>
  ) {}

  /** The brand this account owns, or null when it hasn't provisioned one yet. */
  async myBrand(userId: string): Promise<BrandInfo | null> {
    const doc = await this.brandModel
      .findOne({ ownerId: userId })
      .lean<BrandDocument>()
    return doc?.info ?? null
  }

  /** Every brand in the system — the admin venues/brands view (admin feature). */
  async listAll(): Promise<BrandInfo[]> {
    const docs = await this.brandModel.find().lean<BrandDocument[]>()
    return docs.map((d) => d.info)
  }

  /** The brandId this account owns, or null. */
  async myBrandId(userId: string): Promise<string | null> {
    const doc = await this.brandModel
      .findOne({ ownerId: userId })
      .select("brandId")
      .lean<BrandDocument>()
    return doc?.brandId ?? null
  }

  /**
   * The account's brand, creating it from `seed` on first call. Idempotent: a
   * concurrent create that loses on the unique `ownerId` index refetches the
   * winner; a `brandId` collision (two owners racing for the same `b<n>`)
   * recomputes and retries.
   */
  async ensureBrand(userId: string, seed: BrandInput): Promise<BrandInfo> {
    const existing = await this.myBrand(userId)
    if (existing) return existing
    for (let attempt = 1; ; attempt++) {
      const ids = await this.brandModel.distinct("brandId")
      const info: BrandInfo = {
        id: `b${maxSeq(ids, "b") + 1}`,
        ownerId: userId,
        name: seed.name,
        initials: initialsOf(seed.name),
        image: seed.image,
        description: seed.description,
      }
      try {
        await this.brandModel.create({
          brandId: info.id,
          ownerId: userId,
          info,
        })
        return info
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          const winner = await this.myBrand(userId)
          if (winner) return winner
          if (attempt < 5) continue
        }
        throw err
      }
    }
  }
}
