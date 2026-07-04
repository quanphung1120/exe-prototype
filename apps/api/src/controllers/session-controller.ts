import type { PlaySession } from "@repo/shared"
import type { Context } from "hono"

import { BadRequestError } from "../errors.js"
import {
  deleteSession,
  listUserSessions,
  upsertSession,
} from "../services/session-service.js"
import { requireUserId } from "./context.js"

// A user's persisted PlaySessions (the durable mirror of their client-side
// booking/matchmaking activity). The full session shape is owned by the web
// client, so the PUT body is read directly rather than through a schema that
// would strip unknown keys — the route only asserts the path id, and the
// controller checks the body id matches.
export const sessionController = {
  async list(c: Context) {
    return c.json(await listUserSessions(requireUserId(c)))
  },

  async put(c: Context, param: { id: string }) {
    const body = (await c.req.json().catch(() => null)) as PlaySession | null
    if (!body || typeof body !== "object" || body.id !== param.id) {
      throw new BadRequestError("Body id must match path id")
    }
    return c.json(await upsertSession(requireUserId(c), body))
  },

  async remove(c: Context, param: { id: string }) {
    await deleteSession(requireUserId(c), param.id)
    return c.json({ ok: true })
  },
}
