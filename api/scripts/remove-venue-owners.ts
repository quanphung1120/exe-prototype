// One-off cleanup: remove every venue owner (chủ sân) and everything their
// venues produced, so the platform starts again with no venues.
//
//   cd api && node --import tsx scripts/remove-venue-owners.ts            # dry run
//   cd api && node --import tsx scripts/remove-venue-owners.ts --apply    # do it
//
// Needs the PRODUCTION Clerk and Stream keys (CLERK_SECRET_KEY = sk_live_…,
// STREAM_API_KEY, STREAM_API_SECRET) — set them in the environment, which
// takes precedence over api/.env. With a dev key the dry run reports owners
// "missing from Clerk" and --apply refuses to run.
//
// The dry run only reads and prints the plan. `--apply` first writes every
// document it is about to delete or overwrite to a JSON backup (path printed;
// override with `--backup <file>`), then applies the changes. Clerk accounts
// and Stream messages cannot be restored from that backup.
//
// Who counts as a venue owner: an account that owns a brand or a venue, or
// whose profile chose the "venue"/"both" account type.
//   - Every owner loses their venue side: brands, venues, the bookings and
//     payments at those venues, the play sessions (anyone's) booked there,
//     the room chats of those sessions and the venue/brand chats with players.
//   - A venue-only owner (not also a player — no "player"/"both" type and no
//     skills assessment) is deleted outright: profile, own sessions,
//     notifications, Stream user and the Clerk account.
//   - An owner who is also a player keeps the account and their player data;
//     their account type becomes "player".
//   - Accounts with the Clerk "admin" role are never deleted from Clerk.

import "dotenv/config"
import "reflect-metadata"

import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClerkClient } from "@clerk/express"
import mongoose from "mongoose"
import { StreamChat } from "stream-chat"

const APPLY = process.argv.includes("--apply")
const backupArg = process.argv.indexOf("--backup")
const BACKUP_PATH =
  backupArg > 0
    ? process.argv[backupArg + 1]
    : join(tmpdir(), `shuttio-venue-owners-backup-${Date.now()}.json`)

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return value
}

// The fields this script reads from each raw (schemaless) collection.
interface OwnedRow {
  ownerId?: string | null
}
interface VenueRow extends OwnedRow {
  venueId: string
  info?: { name?: string }
}
interface BrandRow extends OwnedRow {
  brandId: string
  info?: { name?: string }
}
interface ProfileRow {
  userId: string
  accountType?: string | null
  user?: { name?: string }
}
interface SessionRow {
  userId: string
  sessionId: string
  data?: { courtId?: string; venueId?: string }
}
interface BookingRow {
  bookingId: string
  venueId: string
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

  // ── Plan ────────────────────────────────────────────────────────────────
  const brands = await col<BrandRow>("brands").find({}).toArray()
  const venues = await col<VenueRow>("venues").find({}).toArray()
  const profiles = await col<ProfileRow>("profiles").find({}).toArray()

  const ownerIds = [
    ...new Set([
      ...brands.flatMap((b) => b.ownerId ?? []),
      ...venues.flatMap((v) => v.ownerId ?? []),
      ...profiles
        .filter((p) => p.accountType === "venue" || p.accountType === "both")
        .map((p) => p.userId),
    ]),
  ]
  const ownedBrands = brands.filter((b) => ownerIds.includes(b.ownerId ?? ""))
  const ownedVenues = venues.filter((v) => ownerIds.includes(v.ownerId ?? ""))
  const venueIds = ownedVenues.map((v) => v.venueId)
  const brandIds = ownedBrands.map((b) => b.brandId)

  const assessed = new Set(
    (
      await col<{ userId: string }>("playerassessments")
        .find({ userId: { $in: ownerIds } })
        .toArray()
    ).map((a) => a.userId)
  )
  const profileOf = new Map(profiles.map((p) => [p.userId, p]))
  const isAlsoPlayer = (id: string) => {
    const type = profileOf.get(id)?.accountType
    return type === "player" || type === "both" || assessed.has(id)
  }

  const clerk = createClerkClient({ secretKey: env("CLERK_SECRET_KEY") })
  const clerkUsers = new Map<
    string,
    { name: string; email: string; admin: boolean }
  >()
  for (const ids of chunk(ownerIds, 100)) {
    const { data } = await clerk.users.getUserList({
      userId: ids,
      limit: ids.length,
    })
    for (const u of data) {
      clerkUsers.set(u.id, {
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        email:
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
            ?.emailAddress ?? "",
        admin:
          (u.publicMetadata as { role?: string } | undefined)?.role === "admin",
      })
    }
  }

  const fullDelete = ownerIds.filter((id) => !isAlsoPlayer(id))
  const keepAsPlayer = ownerIds.filter(isAlsoPlayer)
  const clerkDeletes = fullDelete.filter(
    (id) => clerkUsers.has(id) && !clerkUsers.get(id)!.admin
  )
  const missingFromClerk = ownerIds.filter((id) => !clerkUsers.has(id))

  const bookings = await col<BookingRow>("bookings")
    .find({ venueId: { $in: venueIds } })
    .toArray()
  const payments = await col("payments")
    .find({ venueId: { $in: venueIds } })
    .toArray()
  const courtIdPattern = venueIds.length
    ? new RegExp(`^(${venueIds.join("|")})c\\d+$`)
    : null
  const sessions = (
    await col<SessionRow>("playsessions").find({}).toArray()
  ).filter(
    (s) =>
      fullDelete.includes(s.userId) ||
      venueIds.includes(s.data?.venueId ?? "") ||
      (courtIdPattern?.test(s.data?.courtId ?? "") ?? false)
  )
  const sessionIds = sessions.map((s) => s.sessionId)
  const notifications = await col("notifications")
    .find({ userId: { $in: fullDelete } })
    .toArray()

  const stream = StreamChat.getInstance(
    env("STREAM_API_KEY"),
    env("STREAM_API_SECRET")
  )
  const channelFilters = [
    ...(venueIds.length ? [{ venueId: { $in: venueIds } }] : []),
    ...(brandIds.length ? [{ brandId: { $in: brandIds } }] : []),
    ...(sessionIds.length
      ? [{ id: { $in: sessionIds.map((id) => `room-${id}`) } }]
      : []),
  ]
  const channels: Awaited<ReturnType<typeof stream.queryChannels>> = []
  for (const filter of channelFilters) {
    for (let offset = 0; ; offset += 30) {
      const page = await stream.queryChannels(
        { type: "messaging", ...filter },
        {},
        { limit: 30, offset, state: false, watch: false, presence: false }
      )
      channels.push(...page)
      if (page.length < 30) break
    }
  }
  const channelCids = [...new Set(channels.map((c) => c.cid))]
  const streamUsers = fullDelete.length
    ? (await stream.queryUsers({ id: { $in: fullDelete } })).users
    : []

  console.log(
    `Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to change data)"}`
  )
  console.table(
    ownerIds.map((id) => ({
      userId: id,
      name: clerkUsers.get(id)?.name ?? profileOf.get(id)?.user?.name ?? "",
      email: clerkUsers.get(id)?.email ?? "(not in Clerk)",
      venues: ownedVenues
        .filter((v) => v.ownerId === id)
        .map((v) => v.info?.name ?? v.venueId)
        .join(", "),
      action: isAlsoPlayer(id)
        ? "remove venue side, keep as player"
        : clerkUsers.get(id)?.admin
          ? "delete data (admin: keep Clerk account)"
          : "delete account",
    }))
  )
  console.table({
    "venue owners": ownerIds.length,
    "  deleted outright": fullDelete.length,
    "  kept as players": keepAsPlayer.length,
    brands: ownedBrands.length,
    venues: `${ownedVenues.length} (${ownedVenues.map((v) => v.info?.name ?? v.venueId).join(", ") || "-"})`,
    bookings: bookings.length,
    payments: payments.length,
    "play sessions": sessions.length,
    notifications: notifications.length,
    "stream channels": channelCids.length,
    "stream users": streamUsers.length,
    "clerk accounts to delete": clerkDeletes.length,
    "owners missing from Clerk": missingFromClerk.length,
  })

  if (!APPLY) {
    await mongoose.disconnect()
    return
  }
  if (missingFromClerk.length) {
    console.error(
      `Refusing to apply: ${missingFromClerk.length} owner(s) were not found in Clerk — ` +
        "CLERK_SECRET_KEY is probably not the production key."
    )
    await mongoose.disconnect()
    process.exit(1)
  }

  // ── Backup ──────────────────────────────────────────────────────────────
  writeFileSync(
    BACKUP_PATH,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        owners: ownerIds.map((id) => ({ userId: id, ...clerkUsers.get(id) })),
        brands: ownedBrands,
        venues: ownedVenues,
        bookings,
        payments,
        playsessions: sessions,
        notifications,
        profiles: ownerIds.flatMap((id) => profileOf.get(id) ?? []),
        streamChannels: channels.map((c) => ({ cid: c.cid, data: c.data })),
        streamUsers,
      },
      null,
      2
    )
  )
  console.log(`Backup written to ${BACKUP_PATH}`)

  // ── Apply ───────────────────────────────────────────────────────────────
  const done: Record<string, number> = {}
  done.bookings = (
    await col("bookings").deleteMany({ venueId: { $in: venueIds } })
  ).deletedCount
  done.payments = (
    await col("payments").deleteMany({ venueId: { $in: venueIds } })
  ).deletedCount
  done.playsessions = (
    await col("playsessions").deleteMany({ sessionId: { $in: sessionIds } })
  ).deletedCount
  done.venues = (
    await col("venues").deleteMany({ venueId: { $in: venueIds } })
  ).deletedCount
  done.brands = (
    await col("brands").deleteMany({ brandId: { $in: brandIds } })
  ).deletedCount
  done.notifications = (
    await col("notifications").deleteMany({ userId: { $in: fullDelete } })
  ).deletedCount
  done.profilesDeleted = (
    await col("profiles").deleteMany({ userId: { $in: fullDelete } })
  ).deletedCount
  done.profilesToPlayer = (
    await col("profiles").updateMany(
      { userId: { $in: keepAsPlayer } },
      { $set: { accountType: "player" } }
    )
  ).modifiedCount
  // Stream caps one batch delete at 100 channels.
  for (const cids of chunk(channelCids, 100)) {
    await stream.deleteChannels(cids, { hard_delete: true })
  }
  done.streamChannels = channelCids.length
  if (streamUsers.length) {
    await stream.deleteUsers(
      streamUsers.map((u) => u.id),
      { user: "hard", messages: "hard", conversations: "hard" }
    )
  }
  done.streamUsers = streamUsers.length
  for (const id of clerkDeletes) {
    await clerk.users.deleteUser(id)
  }
  done.clerkAccounts = clerkDeletes.length

  console.table(done)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect()
  process.exit(1)
})
