// Barrel — the venue workspace's entity **types**, UI **config** and pure
// **helpers** now live in `@repo/shared`, re-exported here so existing
// `@/features/venue/data` imports keep working. The hardcoded venue
// *records* are served by the Hono API and reach components via `useData()`
// (see ../data-provider).
export * from "@repo/shared"
