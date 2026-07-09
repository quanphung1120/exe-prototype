// Small helpers shared across the MongoDB-backed services.

/**
 * True when an error is a MongoDB duplicate-key error (code 11000). Seed-on-empty
 * services race on their unique id index when two first-requests insert at once;
 * a duplicate-key collision there is benign (the rows exist either way), so
 * callers swallow it rather than surface a 500.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  )
}

/**
 * Memoize a one-shot async task (e.g. seed-on-empty) so concurrent first callers
 * share a single in-flight run — but *don't* cache a rejection. If the task
 * throws (a transient Mongo blip during the first request), the memo is cleared
 * so the next caller retries, instead of every later call re-awaiting a
 * permanently-rejected promise and 500ing for the life of the process.
 */
export function once(task: () => Promise<void>): () => Promise<void> {
  let inflight: Promise<void> | undefined
  return () =>
    (inflight ??= task().catch((err: unknown) => {
      inflight = undefined
      throw err
    }))
}
