// Browser-facing origin of the NestJS api. Unlike `lib/api.ts` (server-only,
// compose-network address), this is inlined at build time and must be
// reachable from the user's browser — e.g. the host-published port in
// docker-compose. Keep the literal `process.env.NEXT_PUBLIC_API_URL`
// expression: Next.js replaces it textually during the build.
export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6969"
