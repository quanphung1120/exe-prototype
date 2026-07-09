import type { Context } from "hono"

import { listPlayers } from "./player-service.js"
import { getProfile } from "./profile-service.js"
import { requireUserId } from "../../lib/context.js"

// Player-dashboard read endpoints. The match-suggestion pool is shared discovery
// data (player-service); everything else is the signed-in user's personal
// profile (seeded on first access by profile-service), so these read the caller's
// userId and slice the fields they need out of one profile fetch.
export const playerController = {
  async me(c: Context) {
    const { user, streak, stats } = await getProfile(requireUserId(c))
    return c.json({ user, streak, stats })
  },

  async players(c: Context) {
    return c.json(await listPlayers())
  },

  async rooms(c: Context) {
    return c.json((await getProfile(requireUserId(c))).rooms)
  },

  async bookings(c: Context) {
    return c.json((await getProfile(requireUserId(c))).bookings)
  },

  async chats(c: Context) {
    return c.json((await getProfile(requireUserId(c))).chats)
  },

  async thread(c: Context) {
    return c.json((await getProfile(requireUserId(c))).thread)
  },

  async activity(c: Context) {
    return c.json((await getProfile(requireUserId(c))).activity)
  },

  async notifications(c: Context) {
    return c.json((await getProfile(requireUserId(c))).notifications)
  },
}
