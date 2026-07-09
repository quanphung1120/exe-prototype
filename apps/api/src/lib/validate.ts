import { zValidator } from "@hono/zod-validator"

import type { ValidationTargets } from "hono"
import type { ZodType } from "zod"

import { ValidationError } from "./errors.js"

/**
 * `@hono/zod-validator` with a shared failure hook. On a schema miss it throws
 * `ValidationError` so the central `onError` (app.ts) renders the same
 * `{ error }` shape as every other failure — instead of zod-validator's default
 * `{ success: false, error }` response, which returns directly and never reaches
 * `onError`. Use this in every route in place of the raw `zValidator`; input
 * typing (`c.req.valid(target)`) flows through unchanged.
 */
export function validate<
  T extends ZodType,
  Target extends keyof ValidationTargets,
>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => {
          const path = issue.path.join(".")
          return path ? `${path}: ${issue.message}` : issue.message
        })
        .join("; ")
      throw new ValidationError(detail || "Invalid input")
    }
  })
}
