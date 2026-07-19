# api

The SportMatch AI backend — a [NestJS](https://nestjs.com) server (Express
platform, native ESM) backed by **MongoDB via Mongoose** (`@nestjs/mongoose`,
following the [techniques/mongodb](https://docs.nestjs.com/techniques/mongodb)
guide). It serves the dashboard's seed data and persists venue/session/profile/
assessment state per Clerk user.

## Scripts

```bash
pnpm --filter api dev        # nest start --watch (hot reload) on :6969
pnpm --filter api build      # nest build -> dist/
pnpm --filter api start      # node dist/main.js
pnpm --filter api typecheck  # tsc --noEmit
pnpm --filter api lint       # eslint
pnpm --filter api test       # node:test (guard/auth contract)
pnpm --filter api db:check   # smoke-test the Mongo connection
```

`PORT` overrides the listen port (default `6969`).

## Layout

Feature-based (`src/features/<feature>/`), each with its Mongoose schema
(`*.schema.ts`, `@Schema`/`@Prop`), service (`@InjectModel`), controller and
`*.module.ts`:

- **courts**, **players** (+ per-user **profile**) — shared discovery data,
  seeded on first read from `src/data/`.
- **sessions**, **assessment** — per-Clerk-user persisted state.
- **venues** — operator CRUD (`/api/venues`) + read bundle (`/api/venue/*`),
  one document per venue holding `{ info, ops }` with optimistic concurrency.
- **seed** — the `/api/seed` aggregate composing every service.

Cross-cutting pieces live in `src/common/`:

- `clerk-auth.guard.ts` — global [Clerk](https://clerk.com) guard
  (`@clerk/express`): every `/api/*` request needs a valid session token or gets
  a **401** (a malformed/undecodable token also 401s; a config/JWKS failure is a
  500). `@Public()` opens `/health`. The web forwards `auth().getToken()` as
  `Authorization: Bearer <token>`.
- `all-exceptions.filter.ts` — renders every failure as `{ error: message }` at
  its status.
- `zod-validation.pipe.ts` — validates query/param/body against the app's zod
  schemas (`@Query(new ZodValidationPipe(schema))`).

`main.ts` sets the global `api` prefix (excluding `/health`), CORS (reflects
`WEB_URL`, credentials), and the port. Config (`.env`) is read via
`@nestjs/config`.

## Env (`api/.env`)

```
DATABASE_URL            # MongoDB Atlas SRV URI (Mongoose)
CLERK_SECRET_KEY        # same Clerk keys as the web app
CLERK_PUBLISHABLE_KEY
WEB_URL                 # web origin for CORS (default http://localhost:3000)
PORT                    # default 6969
```

## Routes

| Method            | Path                                             |
| ----------------- | ------------------------------------------------ |
| GET               | `/health` (open)                                 |
| GET               | `/api/seed`                                      |
| GET               | `/api/courts`, `/api/courts/:id`                 |
| GET               | `/api/me` `/players` `/rooms` `/bookings` `/chats` `/chats/thread` `/activity` `/notifications` |
| GET/PUT/DELETE    | `/api/sessions`, `/api/sessions/:id`             |
| GET/PUT           | `/api/assessment`                                |
| GET/POST/PUT/DEL  | `/api/venues` (+ `/:id`, `/:id/courts`, `/:id/reservations/*`, `/:id/customers`) |
| GET               | `/api/venue/{bundle,courts,reservations,customers,analytics,insights}` |
