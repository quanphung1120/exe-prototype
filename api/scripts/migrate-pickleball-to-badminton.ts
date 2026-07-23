// One-off data migration: rewrite every stored "pickleball" sport value to
// "badminton" now that the app is badminton-only. Non-destructive — it fixes
// values in place (venues, sessions, bookings, courts) and dedupes any sport
// arrays; it does not delete records. Safe to re-run (idempotent).
//
//   cd api && node --import tsx scripts/migrate-pickleball-to-badminton.ts
//
// Reads DATABASE_URL from api/.env (same connection the server uses).

import "dotenv/config"
import mongoose from "mongoose"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in api/.env)")
  process.exit(1)
}

// Deep-clone-and-rewrite: replace the exact string "pickleball" with
// "badminton" anywhere in a nested JSON value, and dedupe arrays that end up
// with repeated primitives (e.g. sports: ["badminton", "badminton"]).
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
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = rewrite(v)
      if (r.changed) changed = true
      out[k] = r.value
    }
    return { value: out, changed }
  }
  return { value, changed: false }
}

async function migrateCollection(name: string, mixedPaths: string[]) {
  const col = mongoose.connection.collection(name)
  const total = await col.countDocuments().catch(() => 0)
  if (!total) {
    console.log(`· ${name}: collection empty or missing — skipped`)
    return
  }
  let scanned = 0
  let updated = 0
  const cursor = col.find({})
  for await (const doc of cursor) {
    scanned++
    const set: Record<string, unknown> = {}
    // Rewrite the whole document; only persist top-level fields that changed so
    // we touch as little as possible. Mixed blobs (info/ops) are handled here
    // too since we rewrite the entire nested value.
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
  console.log(
    `· ${name}: scanned ${scanned}, updated ${updated}` +
      (mixedPaths.length ? ` (mixed: ${mixedPaths.join(", ")})` : "")
  )
}

async function main() {
  await mongoose.connect(DATABASE_URL as string)
  console.log("Connected. Migrating pickleball → badminton…\n")

  // Every collection that can carry a sport value. Unknown/missing collections
  // are skipped, so this is safe to run against any environment.
  await migrateCollection("venues", ["info", "ops"])
  await migrateCollection("sessions", [])
  await migrateCollection("bookings", [])
  await migrateCollection("courts", [])
  await migrateCollection("players", [])

  console.log("\nDone.")
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
