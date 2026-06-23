// Smoke test: confirm the Neon driver adapter can reach the database.
// Run with `pnpm --filter api db:check`. Does not touch any tables.
import "dotenv/config"

import { prisma } from "../src/db.js"

const rows = await prisma.$queryRaw`SELECT 1 AS ok`
console.log("✅ Neon connection OK:", rows)
await prisma.$disconnect()
