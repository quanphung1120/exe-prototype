// MongoDB-backed court service. Courts are shared discovery data: the collection
// is seeded once from the hardcoded `COURTS` the first time it's read
// (idempotent), so a fresh database boots with the demo catalog and every user
// browses the same rows. Reads return plain `Court` objects (mongo-managed
// fields stripped, `courtId` mapped back to `id`).

import type { Court, SportKey } from "@repo/shared"

import { COURTS } from "../data/player.js"
import { connectDb } from "../db.js"
import { NotFoundError } from "../errors.js"
import { CourtModel, type CourtDoc } from "../models/court.js"
import { isDuplicateKeyError, once } from "./mongo-util.js"

// Insertion order = catalog order. insertMany assigns ascending _ids in array
// order and stamps the same createdAt, so sorting by _id ascending recovers
// seed order (matching the hardcoded `COURTS`).
const ORDER = { createdAt: 1, _id: 1 } as const

// Memoize the one-time seed so concurrent first-requests don't each insert the
// demo courts (which would collide on the unique `courtId` index). `once` shares
// the in-flight run but doesn't cache a failure, so a transient error retries.
// `ordered: false` inserts every valid row even if one fails, so a mid-array
// error can't leave the catalog permanently partial (a later count check would
// otherwise treat the partial collection as "already seeded").
const ensureSeeded = once(async () => {
  await connectDb()
  if ((await CourtModel.countDocuments()) > 0) return
  try {
    await CourtModel.insertMany(
      COURTS.map(({ id, ...rest }) => ({ courtId: id, ...rest })),
      { ordered: false }
    )
  } catch (err) {
    // A concurrent seeder may have inserted first — a duplicate-key race is
    // benign, the courts exist either way.
    if (!isDuplicateKeyError(err)) throw err
  }
})

/** Map a stored document back to the shared `Court` shape (courtId → id). */
function toCourt(doc: CourtDoc): Court {
  return {
    id: doc.courtId,
    name: doc.name,
    district: doc.district,
    city: doc.city,
    sports: doc.sports,
    surface: doc.surface,
    pricePerHour: doc.pricePerHour,
    distanceKm: doc.distanceKm,
    rating: doc.rating,
    openSlots: doc.openSlots,
    nextSlot: doc.nextSlot,
    freePct: doc.freePct,
    lat: doc.lat,
    lng: doc.lng,
  }
}

/** Every court, optionally filtered to those offering `sport`, in catalog order. */
export async function listCourts(sport?: SportKey): Promise<Court[]> {
  await ensureSeeded()
  const filter = sport ? { sports: sport } : {}
  const docs = await CourtModel.find(filter).sort(ORDER).lean<CourtDoc[]>()
  return docs.map(toCourt)
}

/** One court by its app-level id; throws `NotFoundError` (→ 404) when unknown. */
export async function getCourt(id: string): Promise<Court> {
  await ensureSeeded()
  const doc = await CourtModel.findOne({ courtId: id }).lean<CourtDoc>()
  if (!doc) throw new NotFoundError("Court not found")
  return toCourt(doc)
}
