// Smoke test: confirm Mongoose can reach MongoDB via DATABASE_URL.
// Run with `pnpm --filter api db:check`. Does not touch any collections.
import "dotenv/config"

import mongoose from "mongoose"

const uri = process.env.DATABASE_URL
if (!uri) throw new Error("DATABASE_URL is not set — add it to api/.env")

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const ping = await mongoose.connection.db?.admin().ping()
console.log("✅ MongoDB connection OK:", ping)
await mongoose.disconnect()
