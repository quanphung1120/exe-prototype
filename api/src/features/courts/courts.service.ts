import { Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { Court as CourtType, SportKey } from "../../shared/index.js"

import { COURTS } from "../../data/player.js"
import { isDuplicateKeyError, once } from "../../common/mongo-util.js"
import { Court, toCourt, type CourtDocument } from "./court.schema.js"

// Insertion order = catalog order. insertMany assigns ascending _ids in array
// order and stamps the same createdAt, so sorting by _id ascending recovers seed
// order (matching the hardcoded `COURTS`).
const ORDER = { createdAt: 1, _id: 1 } as const

// MongoDB-backed court service. Courts are shared discovery data: the collection
// is seeded once from the hardcoded `COURTS` the first time it's read
// (idempotent), so a fresh database boots with the demo catalog.
@Injectable()
export class CourtsService {
  constructor(
    @InjectModel(Court.name) private readonly courtModel: Model<CourtDocument>
  ) {}

  // Memoize the one-time seed so concurrent first-requests don't each insert the
  // demo courts (which would collide on the unique `courtId` index). `ordered:
  // false` inserts every valid row even if one fails, so a mid-array error can't
  // leave the catalog permanently partial.
  private readonly ensureSeeded = once(async () => {
    if ((await this.courtModel.countDocuments()) > 0) return
    try {
      await this.courtModel.insertMany(
        COURTS.map(({ id, ...rest }) => ({ courtId: id, ...rest })),
        { ordered: false }
      )
    } catch (err) {
      // A concurrent seeder may have inserted first — a duplicate-key race is
      // benign, the courts exist either way.
      if (!isDuplicateKeyError(err)) throw err
    }
  })

  /** Every court, optionally filtered to those offering `sport`, in catalog order. */
  async listCourts(sport?: SportKey): Promise<CourtType[]> {
    await this.ensureSeeded()
    const filter = sport ? { sports: sport } : {}
    const docs = await this.courtModel.find(filter).sort(ORDER).lean<Court[]>()
    return docs.map(toCourt)
  }

  /** One court by its app-level id; throws NotFound (→ 404) when unknown. */
  async getCourt(id: string): Promise<CourtType> {
    await this.ensureSeeded()
    const doc = await this.courtModel.findOne({ courtId: id }).lean<Court>()
    if (!doc) throw new NotFoundException("Court not found")
    return toCourt(doc)
  }
}
