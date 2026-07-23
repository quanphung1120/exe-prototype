# Release Checklist

This is the pre-release checklist for SportMatch AI. It covers environment
setup, the SePay payment-gateway sandbox flow, reseeding the database, the
full build/lint/typecheck/test matrix, and Clerk test-mode E2E notes.
Cross-reference `FIX_REVIEW_VIENTD.md` for the underlying business decisions
and phase roadmap this checklist assumes.

> **Status note (2026-07-20, updated after Phase 6 merge):** `SEPAY_*` env
> vars and the `payments` feature described in section 2 are **implemented**
> — roadmap **Phase 4** (`FIX_REVIEW_VIENTD.md`) landed (real checkout +
> signed IPN, no more decorative QR/5% deposit/client-side timer). Sandbox
> merchant credentials already live in `api/.env` for local dev/testing; the
> IPN tunnel procedure in section 2 is the real, current setup path for
> exercising it end-to-end, not a future plan.

## 1. Environment variables

Each app loads its own `.env` (api) / `.env.local` (web) — see
`api/.env.example` and `web/.env.example` for the authoritative, up-to-date
list. Never commit `.env`/`.env.local` — both are gitignored.

### api/.env (validated at boot by `src/env.validation.ts`, zod)

| Var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | MongoDB Atlas SRV URI (Mongoose). Missing/blank crashes boot immediately. |
| `CLERK_SECRET_KEY` | yes | Same Clerk app as web. |
| `CLERK_PUBLISHABLE_KEY` | yes | Same Clerk app as web. |
| `STREAM_API_KEY` | yes | GetStream Chat app key. |
| `STREAM_API_SECRET` | yes | GetStream Chat app secret — server-only, signs user tokens. |
| `WEB_URL` | no (default `http://localhost:3000`) | CORS allow-list origin. |
| `PORT` | no (default `6969`) | API listen port. |

### web/.env.local

| Var | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Browser-facing API origin (dashboard seed lives at `/api/seed`). |
| `API_URL` | yes | Server-side API base for SSR fetches. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk dashboard → API Keys. |
| `CLERK_SECRET_KEY` | yes | Clerk dashboard → API Keys. |
| `OPENROUTER_API_KEY` | yes | AI chat route handler (`/dashboard` home). |
| `OPENROUTER_MODEL` | no | Defaults to a small reasoning-capable model; override to any OpenRouter model returning a `reasoning` field. |
| `NEXT_PUBLIC_BOXMAP_TOKEN` | yes (for Find Courts map) | Mapbox token, used by `react-map-gl`. |

### api/.env — `SEPAY_*` (Phase 4, implemented)

Per `FIX_REVIEW_VIENTD.md` Phase 4, the SePay integration (`sepay-pg-node`)
requires (already required by `src/env.validation.ts`'s zod schema and
present in `api/.env.example`; sandbox values are already filled in in
`api/.env` for local dev):

| Var | Notes |
| --- | --- |
| `SEPAY_ENV` | `sandbox` \| `production`. Use `sandbox` for all dev/test — it hits `pgapi-sandbox.sepay.vn` and never touches real money. |
| `SEPAY_MERCHANT_ID` | From the SePay merchant dashboard (sandbox merchant for `sandbox`). |
| `SEPAY_SECRET_KEY` | Signs checkout form fields (HMAC SHA256) and verifies IPN callback signatures — server-only, never exposed to the client. |
| `SEPAY_RETURN_URL` | Where SePay redirects the browser after checkout (web route, e.g. `${WEB_URL}/dashboard/bookings/return`). |

Read via `ConfigService`, never raw `process.env`, per repo convention.

## 2. SePay IPN tunnel setup + sandbox test procedure

SePay's IPN (Instant Payment Notification) webhook needs a publicly reachable
HTTPS URL — `localhost:6969` isn't reachable from SePay's servers, so local
dev needs a tunnel.

### 2.1 Tunnel setup (ngrok or cloudflared — either works)

**ngrok:**

```bash
ngrok http 6969
# copy the https://<random>.ngrok-free.app forwarding URL
```

**cloudflared** (no account needed for a quick tunnel):

```bash
cloudflared tunnel --url http://localhost:6969
# copy the https://<random>.trycloudflare.com URL printed to stderr
```

Either way, the API must be running locally first (`cd api && pnpm dev`).

### 2.2 Point SePay at the tunnel

1. Log into the SePay **sandbox** merchant dashboard.
2. Set the IPN callback URL to `https://<tunnel-host>/api/payments/ipn`
   (the `payments` feature's `@Public()` IPN route).
3. Keep `SEPAY_ENV=sandbox` in `api/.env` for the whole session — sandbox
   transactions never move real money and don't require production
   merchant approval.

### 2.3 Test procedure (golden path — Phase 4 + 5 have landed)

1. `docker compose up --build` (or run `api`/`web` separately) with the
   tunnel pointed at the local API as above.
2. As a **player** account: book a court → redirected to SePay sandbox
   checkout (QR/card) → complete the sandbox payment.
3. Confirm the IPN hits `/api/payments/ipn` (check API logs) and the
   booking transitions `awaiting_payment → pending`.
4. As the **venue owner** account (same or a second Clerk test user):
   see the booking in `pending`, approve it → booking → `confirmed`.
   Separately, test the 30-minute SLA auto-confirm by shortening the
   sweeper interval in dev (`bookings.sweeper.ts`, `@Cron`) rather than
   waiting 30 real minutes.
5. Check-in the booking as venue → `checked-in`; let `endAt` pass (or
   fast-forward the sweeper interval) → auto-`completed`.
6. Cancel a booking made **≥24h** in advance → verify refund record shows
   100%; cancel one made **<24h** in advance → verify 50%; let a booking
   pass its start time uncancelled → verify no-show / 0% refund path.
7. Decline a **pending** reservation as venue **without** a reason →
   expect `400` (reason is mandatory, `@ValidateIf` on `status==="cancelled"`);
   decline **with** a reason → expect 100% refund + a notification reaching
   the player via poll (not just on reload).
8. Because SePay has **no refund API** (verified 2026-07-13, see
   `FIX_REVIEW_VIENTD.md` §3 Phase 4 / §4 risk 3): confirm the refund only
   lands in the **manual refund queue** (`refund.status:"manual"`) and the
   player-facing copy says "hoàn tiền trong vòng 24–48h làm việc" — never
   promise instant refund anywhere in the UI.

Automated tests should fake `sepay.client` (injectable) rather than hit the
sandbox network — see `api/test/*.test.ts` conventions.

## 3. Reseed procedure

Most dashboard data is deterministic seed served from `api/src/data/`, but
venues/courts and a player's own sessions/bookings/assessment are
**seed-on-first-read, Mongo-backed** (`api/src/features/{venues,sessions,assessment}`):
the service checks `countDocuments() === 0` (or `<= 1` for the
single-remaining-venue guard) and inserts the seed rows only when the
collection is empty. There is **no dedicated reseed script** in this repo —
reseeding means making the relevant collection empty again so the
seed-on-first-read path re-fires on the next request.

**Prototype-accepted destructive reseed** (per Phase 1, `FIX_REVIEW_VIENTD.md`):

1. Stop the API (`pnpm dev` process) — avoid reads racing the drop.
2. Connect to the Atlas cluster from `DATABASE_URL` (e.g. `mongosh
   "$DATABASE_URL"`, or MongoDB Compass) and drop the collections you want
   reseeded:
   ```js
   db.venues.drop()
   db.sessions.drop() // player sessions/bookings
   // leave `players`/`assessments` alone unless you specifically want a
   // given user's demo profile/assessment reset too
   ```
3. Restart the API (`pnpm dev`). The next `GET /api/seed` (or any route that
   touches venues/sessions) re-inserts the seed rows, converting demo
   reservation `dayKey`s to real dates anchored on the server's current time
   (`vnNowIso()` — see Phase 1's `serverNow` in the seed payload).
4. Sanity-check: hit `GET /health` then load the web dashboard — the seed
   venues/courts and demo bookings should reappear with dates relative to
   "today" rather than the old fixed anchor.

Use `db:check` (`cd api && pnpm db:check`, runs `scripts/db-check.ts`) to
verify connectivity before/after a reseed if the Atlas cluster is flaky.

## 4. Build / lint / typecheck / test matrix

Run both apps' full gate before any release. All four columns must be green.

```bash
# api
cd api
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # node --import tsx --test test/*.test.ts
pnpm build       # nest build

# web
cd ../web
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # next build (production build — web has no automated tests today)
```

Notes:

- Only `api` has automated tests (Node's built-in test runner via `tsx`).
  Extend `api/test/*.test.ts` per each phase's Verification section in
  `FIX_REVIEW_VIENTD.md` §5 as those phases land — e.g. transition-table
  tests, cancel-policy math, sweeper idempotency, IPN signature/idempotency
  against a faked `sepay.client`.
- `web` has no test runner configured — typecheck + lint + build is the gate;
  rely on manual/E2E verification (§5 below) for behavior.
- Run a single api test file during iteration:
  `node --import tsx --test test/auth.test.ts`.

## 5. Clerk test-mode E2E notes

Clerk is in **Test Mode** for this project — use these to drive E2E flows
without real email/SMS delivery:

- **Email**: append `+clerk_test` to any email local-part, e.g.
  `user+clerk_test@example.com`.
- **Phone**: any fictional phone number works.
- **Verification code**: always `424242` — bypasses standard OTP delivery.

Use two separate test accounts to exercise cross-surface flows (a player
account and a venue-owner account created via the account-type onboarding
flow, `cc3a033`) — most of the golden-path checks below need both sides.

## 6. Golden-path E2E checklist (post Phase 2–5)

Once the booking-unification, endpoint-validation, SePay, and scheduler
phases (2–5) have landed, run this against `docker compose up --build`:

- [ ] Book → pay on SePay sandbox → IPN confirms → venue sees `pending`.
- [ ] Venue approves → booking `confirmed`; separately, let the 30-minute
      SLA elapse (shortened interval in dev) → silent auto-confirm.
- [ ] Venue checks in → `checked-in` → `endAt` passes → auto-`completed`.
- [ ] Cancel at ≥24h → 100% refund record; cancel at <24h → 50%; verify
      no-show / 0% path.
- [ ] Decline requires a reason (400 without one) → 100% refund + player
      notification delivered via poll.
- [ ] Venue ops: create a court block without a reason → rejected; create
      one with a reason → both booking attempts and walk-in on that slot
      get `409`.
- [ ] Archive a court that still has a future `pending`/`confirmed`
      booking → blocked with a `ConflictException` pointing at
      reservations.
- [ ] Walk-in creates/merges a CRM customer by phone; a completed booking
      bumps that customer's `visits`/`ltv`.
- [ ] De-mock (Phase 8–9): two real accounts run join/approve — chat
      membership follows the roster; cancel freezes the room's chat
      channel (no more mock players, no more timer-based fake approval).
