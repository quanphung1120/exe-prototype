import "dotenv/config"

import { defineConfig, env } from "prisma/config"

// Prisma 7 no longer auto-loads `.env` (so `import "dotenv/config"` above makes
// DATABASE_URL from apps/api/.env available) and no longer accepts `url` in the
// schema's datasource — the connection string for CLI tasks (migrate, studio,
// db push) lives here instead. The runtime client connects via the Neon
// adapter in src/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
