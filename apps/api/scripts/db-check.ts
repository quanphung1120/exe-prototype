// Smoke test: confirm Mongoose can reach MongoDB via DATABASE_URL.
// Run with `pnpm --filter api db:check`. Does not touch any collections.
import { connectDb, mongoose } from "../src/db.js"

await connectDb()
const ping = await mongoose.connection.db?.admin().ping()
console.log("✅ MongoDB connection OK:", ping)
await mongoose.disconnect()
