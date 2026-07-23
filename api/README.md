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
SEPAY_ENV                # "sandbox" | "production" — sepay-pg-node checkout/IPN
SEPAY_MERCHANT_ID
SEPAY_SECRET_KEY
SEPAY_RETURN_URL         # web origin the player is redirected back to after checkout
WEB_URL                 # web origin for CORS (default http://localhost:3000)
PORT                    # default 6969
```

See `.env.example` for the full list with comments.

## Testing SePay payments locally

Checkout (`POST /api/payments/checkout`) works against `pgapi-sandbox.sepay.vn`
with just `SEPAY_ENV=sandbox` and sandbox credentials from
[my.sepay.vn](https://my.sepay.vn) (Payment Gateway → Configuration) — no
tunnel needed to _start_ a payment.

The **IPN** (`POST /api/payments/ipn`), SePay's server-to-server payment
notification, is the one leg that needs a publicly reachable URL. To exercise
it against a local dev server:

1. Run `pnpm --filter api dev` (api on `:6969`).
2. Tunnel it: `ngrok http 6969` or `cloudflared tunnel --url http://localhost:6969`.
3. In the SePay sandbox dashboard, register
   `https://<tunnel-host>/api/payments/ipn` as the IPN callback URL.
4. Run the golden path (`POST /api/payments/checkout` → complete the sandbox
   VietQR/card checkout) and confirm the IPN lands: the booking flips
   `awaiting_payment → pending` and the venue owner gets a notification.

`api/test/sepay-client.test.ts` and `api/test/payments-service.test.ts` cover
the HMAC verification and checkout/IPN/reconciliation logic against a fake
`SEPAY_CLIENT` — they never need the tunnel or a real sandbox call.

## Routes

| Method           | Path                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| GET              | `/health` (open)                                                                                |
| GET              | `/api/seed`                                                                                     |
| GET              | `/api/courts`, `/api/courts/:id`                                                                |
| GET              | `/api/me` `/players` `/rooms` `/bookings` `/chats` `/chats/thread` `/activity` `/notifications` |
| GET/PUT/DELETE   | `/api/sessions`, `/api/sessions/:id`                                                            |
| GET/PUT          | `/api/assessment`                                                                               |
| GET/POST/PUT/DEL | `/api/venues` (+ `/:id`, `/:id/courts`, `/:id/reservations/*`, `/:id/customers`)                |
| GET              | `/api/venue/{bundle,courts,reservations,customers,analytics,insights}`                          |
| POST             | `/api/bookings`, `/api/bookings/:id/{cancel,decision,check-in,no-show}`                         |
| GET              | `/api/bookings/mine`                                                                            |
| POST             | `/api/payments/checkout`, `/api/payments/ipn` (open — HMAC-verified)                            |
| GET              | `/api/payments/by-booking/:id`                                                                  |
