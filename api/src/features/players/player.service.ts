import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { Player as PlayerType } from "../../shared/index.js"

import { Player, toPlayer, type PlayerDocument } from "./player.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

// MongoDB-backed player (match-suggestion) pool. Nothing is seeded any more —
// the old hardcoded demo players were removed, so the pool only ever holds
// real entries.
@Injectable()
export class PlayerService {
  constructor(
    @InjectModel(Player.name)
    private readonly playerModel: Model<PlayerDocument>
  ) {}

  /** Every match-suggestion player, oldest first. */
  async listPlayers(): Promise<PlayerType[]> {
    const docs = await this.playerModel.find().sort(ORDER).lean<Player[]>()
    return docs.map(toPlayer)
  }
}
