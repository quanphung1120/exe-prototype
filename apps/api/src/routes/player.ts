import { Hono } from "hono"

import { playerController } from "../controllers/player-controller.js"

// Player-dashboard resources. Route wiring only — the controller reads the
// signed-in user's profile (or the shared player pool) and shapes each response.
// Chained so the exported route type flows into `AppType` for RPC inference.
export const player = new Hono()
  .get("/me", (c) => playerController.me(c))
  .get("/players", (c) => playerController.players(c))
  .get("/rooms", (c) => playerController.rooms(c))
  .get("/bookings", (c) => playerController.bookings(c))
  .get("/chats", (c) => playerController.chats(c))
  .get("/chats/thread", (c) => playerController.thread(c))
  .get("/activity", (c) => playerController.activity(c))
  .get("/notifications", (c) => playerController.notifications(c))
