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
 * A duplicate-key error (11000) whose offending index covers `field`. Lets a
 * retry loop that only knows how to resolve one kind of collision (e.g. recompute
 * a `v<n>` id after a `venueId` race) act *only* on that index, and surface any
 * other unique-constraint violation instead of looping on it forever.
 */
export function isDuplicateKeyErrorOn(err: unknown, field: string): boolean {
  if (!isDuplicateKeyError(err)) return false
  const keyPattern = (err as { keyPattern?: Record<string, unknown> })
    .keyPattern
  return keyPattern != null && field in keyPattern
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

/** True when `err` is a Mongoose `VersionError` from a document's `optimisticConcurrency`. */
function isVersionConflict(err: unknown): boolean {
  return err instanceof Error && err.name === "VersionError"
}

/**
 * Run a find→mutate→save mutation, retrying on a Mongoose `VersionError`. Docs
 * with `optimisticConcurrency` (venues, bookings) version every save, so two
 * concurrent writers who each loaded the same snapshot would otherwise have the
 * later save silently clobber the earlier one; re-running here reloads the
 * fresh doc and re-applies the change, so concurrent writes compose instead of
 * losing one.
 */
export async function withVersionRetry<T>(
  mutate: () => Promise<T>,
  tries = 4
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mutate()
    } catch (err) {
      if (!isVersionConflict(err) || attempt >= tries) throw err
    }
  }
}

/**
 * True when a MongoDB error means the deployment doesn't support multi-document
 * transactions — a standalone `mongod`, not a replica set or `mongos`. Atlas
 * clusters (including the free M0 tier) are always replica sets, so this is a
 * defensive fallback for local/self-hosted MongoDB, not the expected path in
 * production. See `bookings.service.ts`'s per-court lock-doc fallback.
 */
export function isTransactionsUnsupported(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // IllegalOperation: "Transaction numbers are only allowed on a replica set
  // member or mongos".
  if ((err as { code?: number }).code === 20) return true
  return (
    /transaction/i.test(err.message) &&
    /not support|replica set|mongos/i.test(err.message)
  )
}
