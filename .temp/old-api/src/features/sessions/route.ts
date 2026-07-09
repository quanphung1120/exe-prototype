import { Hono } from "hono"
import * as z from "zod"

import { sessionController } from "./controller.js"
import { validate } from "../../lib/validate.js"

const idParam = z.object({ id: z.string().min(1) })

// A user's persisted PlaySessions. Route wiring only — the controller enforces
// the body/path id match and the session service handles persistence.
export const sessions = new Hono()
  .get("/", (c) => sessionController.list(c))
  .put("/:id", validate("param", idParam), (c) =>
    sessionController.put(c, c.req.valid("param"))
  )
  .delete("/:id", validate("param", idParam), (c) =>
    sessionController.remove(c, c.req.valid("param"))
  )
