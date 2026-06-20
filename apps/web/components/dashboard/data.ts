// Barrel — the player dashboard's entity **types**, UI **config** (sport
// catalog, level/accent maps, slot grids) and pure **helpers** now live in the
// shared workspace package `@repo/shared`, re-exported here so existing
// `@/components/dashboard/data` imports keep working.
//
// The hardcoded *records* (courts, players, bookings, …) no longer live in the
// web app: they are served by the Hono API and reach components through
// `useData()` (see ./data-provider). Helpers that need a record take it as an
// argument in `@repo/shared`; `useData()` exposes pre-bound versions.
export * from "@repo/shared"
