// One-off cleanup: remove every piece of mock/demo data the app used to seed
// into MongoDB and Stream Chat, now that nothing is seeded any more.
//
//   cd api && node --import tsx scripts/remove-mock-data.ts            # dry run
//   cd api && node --import tsx scripts/remove-mock-data.ts --apply    # do it
//
// The dry run only reads and prints what would change. `--apply` first writes
// every document it is about to delete or overwrite to a JSON backup (path
// printed; override with `--backup <file>`), then applies the changes.
// Safe to re-run: a second run finds nothing left to do.
//
// What counts as mock data (and what is kept):
//   - venues with no owner (the old demo venues) + their bookings, payments
//     and play sessions — and the room chats of those sessions;
//   - synthetic "completed walk-in" history bookings the onboarding seed
//     generated for a fresh venue, and the fake CRM customers it added;
//   - the shared demo player pool, the sample discount codes, the legacy
//     `courts` collection and the Stream seed marker collection;
//   - every profile's fake identity/stats/activity — reset to an empty profile
//     carrying the account's real Clerk name (its account type is kept);
//   - Stream demo channels (`demo-ch*-<user>`) and demo users (`demo-player-*`).
// Real venues, brands, real bookings/payments, assessments, ratings,
// notifications and app reviews are never touched.

import "dotenv/config"
import "reflect-metadata"

import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClerkClient } from "@clerk/express"
import mongoose from "mongoose"
import { StreamChat } from "stream-chat"

import type { ProfileData } from "../src/features/players/profile.schema.js"
import { emptyProfileData } from "../src/features/players/profile.service.js"
import { ClerkDirectoryService } from "../src/features/stream/clerk-directory.service.js"

const APPLY = process.argv.includes("--apply")
const backupArg = process.argv.indexOf("--backup")
const BACKUP_PATH =
  backupArg > 0
    ? process.argv[backupArg + 1]
    : join(tmpdir(), `shuttio-mock-backup-${Date.now()}.json`)

/** Names the old onboarding seed gave its synthetic walk-in customers. */
const SEED_HISTORY_NAMES = [
  "Nguyễn Hải",
  "Trần Minh",
  "Lê Phương",
  "Phạm Đức",
  "Vũ Thảo",
  "Đặng Quang",
  "Bùi Ngọc",
  "Hoàng Nam",
  "Đỗ Linh",
  "Ngô Tú",
]
/** The sample codes the discount seed inserted. */
const SEED_DISCOUNT_CODES = ["GIAM10", "GIAM20", "SPORT50K", "HETHAN"]
/** Stream demo users and per-user demo chats the token seed created. */
const DEMO_STREAM_USERS = ["demo-player-th", "demo-player-ll", "demo-player-pq"]
const DEMO_CHAT_IDS = ["ch1", "ch2", "ch3", "ch4"]

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set (expected in api/.env)`)
    process.exit(1)
  }
  return value
}

// The fields this script reads from each raw (schemaless) collection.
interface VenueRow {
  venueId: string
  ownerId?: string | null
  info?: { name?: string }
  ops?: { customers?: { id: string; name: string }[] }
}
interface BookingRow {
  bookingId: string
  venueId: string
  customer?: { phone?: string }
}
interface SessionRow {
  sessionId: string
  data?: { courtId?: string; venue?: string; reservationId?: string }
}
interface UserRow {
  userId: string
}
interface CodeRow {
  code: string
}

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size)
  )

async function main() {
  await mongoose.connect(env("DATABASE_URL"))
  const db = mongoose.connection.db!
  const col = <T extends object = Record<string, unknown>>(name: string) =>
    db.collection<T>(name)
  const collections = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  )

  // ── Plan ────────────────────────────────────────────────────────────────
  const demoVenues = await col<VenueRow>("venues")
    .find({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] })
    .toArray()
  const demoVenueIds = demoVenues.map((v) => v.venueId)
  const demoVenueNames = demoVenues.flatMap((v) => v.info?.name ?? [])

  const demoVenueBookings = await col<BookingRow>("bookings")
    .find({ venueId: { $in: demoVenueIds } })
    .toArray()
  const syntheticBookings = await col<BookingRow>("bookings")
    .find({
      venueId: { $nin: demoVenueIds },
      source: "walk-in",
      status: "completed",
      paymentStatus: "none",
      "customer.name": { $in: SEED_HISTORY_NAMES },
      "customer.phone": { $regex: /^09\d{8}$/ },
    })
    .toArray()
  const bookingsToDelete = [...demoVenueBookings, ...syntheticBookings]
  const bookingIds = bookingsToDelete.map((b) => b.bookingId)
  const payments = await col("payments")
    .find({ bookingId: { $in: bookingIds } })
    .toArray()

  // Synthetic CRM rows on real venues: a seed name keyed by the phone of one
  // of the synthetic bookings above (that's how the seed minted them).
  const syntheticPhones = new Set(
    syntheticBookings.flatMap((b) => b.customer?.phone ?? [])
  )
  const crmVenues = await col<VenueRow>("venues")
    .find({
      venueId: {
        $in: [...new Set(syntheticBookings.map((b) => b.venueId))],
      },
    })
    .toArray()
  const crmEdits = crmVenues
    .map((v) => {
      const customers = v.ops?.customers ?? []
      const keep = customers.filter(
        (c) =>
          !(SEED_HISTORY_NAMES.includes(c.name) && syntheticPhones.has(c.id))
      )
      return { venue: v, keep, removed: customers.length - keep.length }
    })
    .filter((e) => e.removed > 0)

  const venueNamePattern = demoVenueNames.length
    ? new RegExp(
        `^(${demoVenueNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})( · |$)`
      )
    : null
  const sessions = (
    await col<SessionRow>("playsessions").find({}).toArray()
  ).filter(
    (s) =>
      demoVenueIds.some((id) =>
        new RegExp(`^${id}c\\d+$`).test(s.data?.courtId ?? "")
      ) ||
      /^vc\d+$/.test(s.data?.courtId ?? "") ||
      (venueNamePattern?.test(s.data?.venue ?? "") ?? false) ||
      bookingIds.includes(s.data?.reservationId ?? "")
  )
  const sessionIds = sessions.map((s) => s.sessionId)

  const players = await col("players").find({}).toArray()
  const discounts = await col<CodeRow>("discountcodes")
    .find({ code: { $in: SEED_DISCOUNT_CODES }, usedCount: 0 })
    .toArray()
  const legacyCourts = collections.has("courts")
    ? await col("courts").find({}).toArray()
    : []
  const streamSeeds = collections.has("streamseeds")
    ? await col<UserRow>("streamseeds").find({}).toArray()
    : []

  const profiles = await col<UserRow>("profiles").find({}).toArray()
  const userIds = profiles.map((p) => p.userId)
  const directory = new ClerkDirectoryService(
    createClerkClient({ secretKey: env("CLERK_SECRET_KEY") })
  )
  const clerkUsers = (
    await Promise.all(chunk(userIds, 100).map((ids) => directory.getMany(ids)))
  ).flat()
  const clerkName = new Map(clerkUsers.map((u) => [u.id, u.name]))

  const stream = StreamChat.getInstance(
    env("STREAM_API_KEY"),
    env("STREAM_API_SECRET")
  )
  const streamUserIds = [
    ...new Set([...userIds, ...streamSeeds.map((s) => s.userId)]),
  ]
  const candidateChannelIds = [
    ...streamUserIds.flatMap((u) => DEMO_CHAT_IDS.map((c) => `demo-${c}-${u}`)),
    ...sessionIds.map((id) => `room-${id}`),
  ]
  const existingChannels = (
    await Promise.all(
      chunk(candidateChannelIds, 30).map((ids) =>
        stream.queryChannels(
          { type: "messaging", id: { $in: ids } },
          {},
          { limit: 30, state: false, watch: false, presence: false }
        )
      )
    )
  ).flat()
  const channelCids = existingChannels.map((c) => c.cid)
  const { users: demoUsers } = await stream.queryUsers({
    id: { $in: DEMO_STREAM_USERS },
  })

  console.log(
    `Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to change data)"}`
  )
  console.table({
    "demo venues": `${demoVenues.length} (${demoVenueNames.join(", ") || "-"})`,
    "bookings at demo venues": demoVenueBookings.length,
    "synthetic walk-in bookings": syntheticBookings.length,
    "payments of those bookings": payments.length,
    "fake CRM customers": crmEdits.reduce((n, e) => n + e.removed, 0),
    "play sessions at demo venues": sessions.length,
    "demo players": players.length,
    "sample discount codes": `${discounts.length} (${discounts.map((d) => d.code).join(", ") || "-"})`,
    "legacy courts collection": legacyCourts.length,
    "stream seed markers": streamSeeds.length,
    "profiles to reset": `${profiles.length} (${clerkUsers.length} names from Clerk)`,
    "stream demo/room channels": channelCids.length,
    "stream demo users": demoUsers.length,
  })

  if (!APPLY) {
    await mongoose.disconnect()
    return
  }

  // ── Backup ──────────────────────────────────────────────────────────────
  writeFileSync(
    BACKUP_PATH,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        venues: demoVenues,
        crmVenuesBefore: crmEdits.map((e) => e.venue),
        bookings: bookingsToDelete,
        payments,
        playsessions: sessions,
        players,
        discountcodes: discounts,
        courts: legacyCourts,
        streamseeds: streamSeeds,
        profilesBefore: profiles,
        streamChannels: existingChannels.map((c) => ({
          cid: c.cid,
          data: c.data,
        })),
        streamUsers: demoUsers,
      },
      null,
      2
    )
  )
  console.log(`Backup written to ${BACKUP_PATH}`)

  // ── Apply ───────────────────────────────────────────────────────────────
  const done: Record<string, number> = {}
  done.venues = (
    await col("venues").deleteMany({ venueId: { $in: demoVenueIds } })
  ).deletedCount
  done.bookings = (
    await col("bookings").deleteMany({ bookingId: { $in: bookingIds } })
  ).deletedCount
  done.payments = (
    await col("payments").deleteMany({ bookingId: { $in: bookingIds } })
  ).deletedCount
  for (const edit of crmEdits) {
    await col<{ __v: number }>("venues").updateOne(
      { _id: edit.venue._id },
      { $set: { "ops.customers": edit.keep }, $inc: { __v: 1 } }
    )
  }
  done.crmCustomers = crmEdits.reduce((n, e) => n + e.removed, 0)
  done.playsessions = (
    await col("playsessions").deleteMany({ sessionId: { $in: sessionIds } })
  ).deletedCount
  done.players = (await col("players").deleteMany({})).deletedCount
  done.discountcodes = (
    await col("discountcodes").deleteMany({
      _id: { $in: discounts.map((d) => d._id) },
    })
  ).deletedCount
  if (collections.has("courts")) {
    await col("courts").drop()
    done.courts = legacyCourts.length
  }
  if (collections.has("streamseeds")) {
    await col("streamseeds").drop()
    done.streamseeds = streamSeeds.length
  }
  for (const profile of profiles) {
    // Everything but the account type, which is the user's own choice.
    const reset: Partial<ProfileData> = emptyProfileData(
      clerkName.get(profile.userId) ?? ""
    )
    delete reset.accountType
    await col("profiles").updateOne({ _id: profile._id }, { $set: reset })
  }
  done.profiles = profiles.length
  // Stream caps one batch delete at 100 channels.
  for (const cids of chunk(channelCids, 100)) {
    await stream.deleteChannels(cids, { hard_delete: true })
  }
  done.streamChannels = channelCids.length
  if (demoUsers.length) {
    await stream.deleteUsers(
      demoUsers.map((u) => u.id),
      { user: "hard", messages: "hard", conversations: "hard" }
    )
  }
  done.streamUsers = demoUsers.length

  console.table(done)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect()
  process.exit(1)
})
