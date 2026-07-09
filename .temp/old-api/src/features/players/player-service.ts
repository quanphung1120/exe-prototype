// MongoDB-backed player (match-suggestion) service. Like courts, players are
// shared discovery data: the collection is seeded once from the hardcoded
// `MATCH_SUGGESTIONS` the first time it's read (idempotent), and every user sees
// the same candidate pool. Reads return plain `Player` objects (`playerId`
// mapped back to `id`).

import type { Player } from "@repo/shared"

import { MATCH_SUGGESTIONS } from "../../data/player.js"
import { connectDb } from "../../lib/db.js"
import { PlayerModel, type PlayerDoc } from "./player-model.js"
import { isDuplicateKeyError, once } from "../../lib/mongo-util.js"

const ORDER = { createdAt: 1, _id: 1 } as const

// See court-service for why `once` (retry on transient failure) + `ordered: false`
// (no permanently-partial seed).
const ensureSeeded = once(async () => {
  await connectDb()
  if ((await PlayerModel.countDocuments()) > 0) return
  try {
    await PlayerModel.insertMany(
      MATCH_SUGGESTIONS.map(({ id, ...rest }) => ({ playerId: id, ...rest })),
      { ordered: false }
    )
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err
  }
})

/** Map a stored document back to the shared `Player` shape (playerId → id). */
function toPlayer(doc: PlayerDoc): Player {
  return {
    id: doc.playerId,
    name: doc.name,
    initials: doc.initials,
    level: doc.level,
    sport: doc.sport,
    distanceKm: doc.distanceKm,
    matchPct: doc.matchPct,
    trust: doc.trust,
    online: doc.online,
    blurb: doc.blurb,
  }
}

/** Every match-suggestion player, in seed order. */
export async function listPlayers(): Promise<Player[]> {
  await ensureSeeded()
  const docs = await PlayerModel.find().sort(ORDER).lean<PlayerDoc[]>()
  return docs.map(toPlayer)
}
