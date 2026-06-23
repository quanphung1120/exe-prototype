import "dotenv/config"

import { PrismaNeon } from "@prisma/adapter-neon"

import { PrismaClient } from "./generated/prisma/client.js"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set — add it to apps/api/.env")
}

// The Neon serverless driver adapter. Prisma 7 runs its query compiler against
// this adapter (no Rust query engine); it reads the pooled Neon connection
// string from the env. CLI tasks (migrate/studio) use the same URL via
// prisma.config.ts.
const adapter = new PrismaNeon({ connectionString })

// Reuse a single client across `tsx watch` hot-reloads in dev so we don't leak
// Neon connections on every restart. In production a single module instance is
// fine.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
