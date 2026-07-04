import "dotenv/config"

import mongoose from "mongoose"

// MongoDB connection via Mongoose. The connection string (a `mongodb+srv://…`
// Atlas URI) is read from `DATABASE_URL` in apps/api/.env.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — add it to apps/api/.env")
}

// Narrowed to `string` so the closure below keeps the type (control-flow
// narrowing of `process.env` doesn't reach into nested functions).
const uri: string = process.env.DATABASE_URL

// Cache the connection promise across `tsx watch` hot-reloads (and across the
// many modules that may call `connectDb()`) so we open a single Mongo pool
// instead of leaking a new one on every restart / import.
const globalForMongoose = globalThis as unknown as {
  mongoosePromise?: Promise<typeof mongoose>
}

/**
 * Connect to MongoDB (idempotent). Returns the shared connection promise, so
 * concurrent callers await the same in-flight connect rather than racing.
 */
export function connectDb(): Promise<typeof mongoose> {
  return (globalForMongoose.mongoosePromise ??= mongoose
    .connect(uri, {
      // Fail fast when the cluster is unreachable rather than hanging requests.
      serverSelectionTimeoutMS: 8000,
    })
    .catch((err: unknown) => {
      // Never cache a *failed* connection: a rejected promise is still truthy,
      // so leaving it in the slot would make every later connectDb() re-await
      // the same rejection and 500 forever, even after Mongo recovers. Clear
      // the memo so the next caller opens a fresh attempt.
      globalForMongoose.mongoosePromise = undefined
      throw err
    }))
}

export { mongoose }
