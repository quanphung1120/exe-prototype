import { Hono } from "hono"

import {
  ACTIVITY,
  BOOKINGS,
  CHATS,
  MATCH_SUGGESTIONS,
  NOTIFICATIONS,
  ROOMS,
  SESSIONS,
  STATS,
  STREAK,
  THREAD,
  USER,
} from "../data/player.js"

// Player-dashboard resources. Handlers are chained so the exported route type
// flows into `AppType` for end-to-end RPC inference.
export const player = new Hono()
  .get("/me", (c) => c.json({ user: USER, streak: STREAK, stats: STATS }))
  .get("/players", (c) => c.json(MATCH_SUGGESTIONS))
  .get("/rooms", (c) => c.json(ROOMS))
  .get("/bookings", (c) => c.json(BOOKINGS))
  .get("/sessions", (c) => c.json(SESSIONS))
  .get("/chats", (c) => c.json(CHATS))
  .get("/chats/thread", (c) => c.json(THREAD))
  .get("/activity", (c) => c.json(ACTIVITY))
  .get("/notifications", (c) => c.json(NOTIFICATIONS))
