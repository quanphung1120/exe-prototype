import type { ContentfulStatusCode } from "hono/utils/http-status"

// The one place the API defines what an "expected failure" is. Services and
// controllers throw these instead of returning `undefined`/tagged sentinels or
// translating outcomes into HTTP by hand; the central `onError` (app.ts) maps
// any AppError to `{ error: message }` at its status. So a missing row, a
// conflict, or bad input surfaces as the right code with a clean body — and
// only genuinely unexpected throws fall through to a 500.

/** Base class for expected, client-facing failures carrying an HTTP status. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode

  constructor(status: ContentfulStatusCode, message: string) {
    super(message)
    // Use the concrete subclass name (NotFoundError, …) for logs/stack frames.
    this.name = new.target.name
    this.status = status
  }
}

/** 400 — the request was syntactically or semantically invalid. */
export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message)
  }
}

/** 400 — input failed schema validation (thrown by the shared `validate` hook). */
export class ValidationError extends AppError {
  constructor(message = "Invalid input") {
    super(400, message)
  }
}

/** 401 — no valid signed-in user. */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message)
  }
}

/** 404 — the addressed resource doesn't exist. */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message)
  }
}

/** 409 — the request conflicts with the resource's current state. */
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message)
  }
}
