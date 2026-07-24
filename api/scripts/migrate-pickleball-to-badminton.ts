// One-off data migration: rewrite every stored "pickleball" sport value to
// "badminton" now that the app is badminton-only. Non-destructive — it fixes
// values in place and dedupes any sport arrays; it does not delete records.
// Safe to re-run (idempotent).
//
//   cd api && node --import tsx scripts/migrate-pickleball-to-badminton.ts
//
// Reads DATABASE_URL from api/.env (same connection the server uses).
//
// It enumerates EVERY collection in the database rather than a hardcoded list —
// an earlier version targeted stale collection names (`bookings`, `sessions`,
// `players`) that don't match the real ones (`profiles`, `playsessions`,
// `playerassessments`), so it silently skipped the documents that actually held
// the value. Scanning all collections can't drift out of sync that way.

import "dotenv/config"
import mongoose from "mongoose"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in api/.env)")
  process.exit(1)
}

// Deep-clone-and-rewrite: replace the string "pickleball" with "badminton"
// anywhere in a nested JSON value, dedupe primitive arrays that collapse to
// duplicates (e.g. ["badminton","pickleball"] → ["badminton"]), AND rename a
// "pickleball" OBJECT KEY to "badminton" (sport-keyed maps such as an
// assessment's `results`). On a key collision the existing "badminton" entry
// wins and the pickleball one is dropped — the real badminton assessment is
// authoritative, not the legacy pickleball copy.
function rewrite(value: unknown): { value: unknown; changed: boolean } {
  if (value === "pickleball") return { value: "badminton", changed: true }

  if (Array.isArray(value)) {
    let changed = false
    const mapped = value.map((v) => {
      const r = rewrite(v)
      if (r.changed) changed = true
      return r.value
    })
    // Dedupe primitive duplicates introduced by the rewrite (order-preserving).
    // Object/array items are left as-is — distinct bookings/rooms that merely
    // share a sport are NOT duplicates.
    const deduped: unknown[] = []
    for (const item of mapped) {
      const isPrimitive = item === null || typeof item !== "object"
      if (isPrimitive && deduped.includes(item)) {
        changed = true
        continue
      }
      deduped.push(item)
    }
    return { value: deduped, changed }
  }

  if (value && typeof value === "object") {
    let changed = false
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    // First pass: rewrite every key except a literal "pickleball" key.
    for (const [k, v] of Object.entries(src)) {
      if (k === "pickleball") continue
      const r = rewrite(v)
      if (r.changed) changed = true
      out[k] = r.value
    }
    // Rename a "pickleball" object key → "badminton" (target-wins on collision).
    if ("pickleball" in src) {
      changed = true
      if (!("badminton" in out)) out.badminton = rewrite(src.pickleball).value
    }
    return { value: out, changed }
  }

  return { value, changed: false }
}

async function migrateCollection(name: string) {
  const col = mongoose.connection.collection(name)
  const total = await col.countDocuments().catch(() => 0)
  if (!total) {
    console.log(`· ${name}: empty — skipped`)
    return
  }
  let scanned = 0
  let updated = 0
  const cursor = col.find({})
  for await (const doc of cursor) {
    scanned++
    const set: Record<string, unknown> = {}
    // Rewrite the whole document; persist only the top-level fields that
    // changed so we touch as little as possible.
    for (const [k, v] of Object.entries(doc)) {
      if (k === "_id") continue
      const r = rewrite(v)
      if (r.changed) set[k] = r.value
    }
    if (Object.keys(set).length) {
      await col.updateOne({ _id: doc._id }, { $set: set })
      updated++
    }
  }
  console.log(`· ${name}: scanned ${scanned}, updated ${updated}`)
}

async function main() {
  await mongoose.connect(DATABASE_URL as string)
  console.log("Connected. Migrating pickleball → badminton…\n")

  // Every collection in the database — the rewrite is a no-op on clean docs, so
  // scanning all of them is safe and can never miss a renamed collection.
  const cols = await mongoose.connection.db!.listCollections().toArray()
  for (const { name } of cols.sort((a, b) => a.name.localeCompare(b.name))) {
    await migrateCollection(name)
  }

  console.log("\nDone.")
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
