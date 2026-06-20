// Assembles the full hardcoded dataset the web app hydrates in one request.

import type { Seed } from "@repo/shared"

import {
  ACTIVITY,
  BOOKINGS,
  CHATS,
  COURTS,
  MATCH_SUGGESTIONS,
  NOTIFICATIONS,
  ROOMS,
  SESSIONS,
  STATS,
  STREAK,
  THREAD,
  USER,
} from "./player.js"
import {
  activeBundle,
  listVenues,
  resolveActiveId,
} from "../store/venue-store.js"

/**
 * The complete seed payload (player + venue), built from the hardcoded records.
 * `activeVenueId` selects which venue's operator bundle the `venue` key carries
 * (defaults to the first venue); the full venue list always rides along.
 */
export function buildSeed(activeVenueId?: string): Seed {
  return {
    user: USER,
    players: MATCH_SUGGESTIONS,
    courts: COURTS,
    rooms: ROOMS,
    bookings: BOOKINGS,
    sessions: SESSIONS,
    chats: CHATS,
    thread: THREAD,
    streak: STREAK,
    stats: STATS,
    activity: ACTIVITY,
    notifications: NOTIFICATIONS,
    venues: listVenues(),
    activeVenueId: resolveActiveId(activeVenueId),
    venue: activeBundle(activeVenueId),
  }
}
