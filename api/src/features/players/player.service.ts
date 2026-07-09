import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { Player as PlayerType } from "../../shared/index.js"

import { MATCH_SUGGESTIONS } from "../../data/player.js"
import { isDuplicateKeyError, once } from "../../common/mongo-util.js"
import { Player, toPlayer, type PlayerDocument } from "./player.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

// MongoDB-backed player (match-suggestion) service. Like courts, players are
// shared discovery data: seeded once from the hardcoded `MATCH_SUGGESTIONS` the
// first time it's read (idempotent).
@Injectable()
export class PlayerService {
  constructor(
    @InjectModel(Player.name) private readonly playerModel: Model<PlayerDocument>
  ) {}

  // See CourtsService for why `once` (retry on transient failure) +
  // `ordered: false` (no permanently-partial seed).
  private readonly ensureSeeded = once(async () => {
    if ((await this.playerModel.countDocuments()) > 0) return
    try {
      await this.playerModel.insertMany(
        MATCH_SUGGESTIONS.map(({ id, ...rest }) => ({ playerId: id, ...rest })),
        { ordered: false }
      )
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
  })

  /** Every match-suggestion player, in seed order. */
  async listPlayers(): Promise<PlayerType[]> {
    await this.ensureSeeded()
    const docs = await this.playerModel.find().sort(ORDER).lean<Player[]>()
    return docs.map(toPlayer)
  }
}
