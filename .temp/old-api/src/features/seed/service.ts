// Assembles the full dataset the web app hydrates in one request (`/api/seed`),
// composing every service: shared discovery data (courts, players) + the signed-
// in user's personal pre-data (profile) + the DB-backed venue and session
// stores.

import { buildSeedSessions, type Seed } from "@repo/shared"

import { listCourts } from "../courts/service.js"
import { listPlayers } from "../players/player-service.js"
import { defaultProfile, getProfile } from "../players/profile-service.js"
import { listUserSessions } from "../sessions/service.js"
import { activeBundle, listVenues } from "../venues/service.js"

/**
 * The complete seed payload (player + venue). `activeVenueId` selects which
 * venue's operator bundle the `venue` key carries (defaults to the first venue).
 * `userId` (when signed in) drives the personal half: their profile pre-data
 * plus their persisted PlaySessions layered over the demo sessions derived from
 * that profile's rooms/bookings — so a user's own booking/room overrides any
 * seed session sharing its id, while the rest stays their seeded pre-data.
 */
export async function buildSeed(
  activeVenueId?: string,
  userId?: string
): Promise<Seed> {
  const [courts, players, profile, userSessions] = await Promise.all([
    listCourts(),
    listPlayers(),
    userId ? getProfile(userId) : Promise.resolve(defaultProfile()),
    userId ? listUserSessions(userId) : Promise.resolve([]),
  ])

  // The demo sessions are derived from *this user's* profile rooms/bookings, so
  // a fresh user gets the same seed sessions the app has always shipped; their
  // persisted sessions then override any sharing an id.
  const demoSessions = buildSeedSessions(
    profile.rooms,
    profile.bookings,
    courts,
    profile.user,
    players
  )
  const ownIds = new Set(userSessions.map((s) => s.id))
  const sessions = [
    ...userSessions,
    ...demoSessions.filter((s) => !ownIds.has(s.id)),
  ]

  // `listVenues()` already loads every venue profile, so resolve the active id
  // from that in-memory list (falling back to the first venue) instead of a
  // separate DB round-trip; `activeBundle` still fetches the one bundle's ops.
  const [venues, venue] = await Promise.all([
    listVenues(),
    activeBundle(activeVenueId),
  ])
  const resolvedVenueId =
    (activeVenueId && venues.find((v) => v.id === activeVenueId)?.id) ||
    venues[0]?.id

  return {
    user: profile.user,
    players,
    courts,
    rooms: profile.rooms,
    bookings: profile.bookings,
    sessions,
    chats: profile.chats,
    thread: profile.thread,
    streak: profile.streak,
    stats: profile.stats,
    activity: profile.activity,
    notifications: profile.notifications,
    venues,
    activeVenueId: resolvedVenueId,
    venue,
  }
}
