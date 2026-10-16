# Release Checklist

This is the pre-release checklist for SportMatch AI. It covers environment
setup, the VietQR payment flow, reseeding the database, the
full build/lint/typecheck/test matrix, and Clerk test-mode E2E notes.
Cross-reference `FIX_REVIEW_VIENTD.md` for the underlying business decisions
and phase roadmap this checklist assumes.

> **Status note (2026-10):** payments are **VietQR bank transfers** straight
> from the player to the venue owner (plan `plans/025-replace-sepay-with-vietqr.md`).
> The SePay gateway, its `SEPAY_*` env vars, the IPN webhook, the wallet and
> top-ups are gone — nothing here needs a tunnel or a payment sandbox.

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

### api/.env — payments

There are no payment-gateway secrets. Transfer screenshots (player proof and
the venue's refund proof) are uploaded straight from the browser to Cloudinary
with a signature the api issues, so the same `CLOUDINARY_CLOUD_NAME` /
`CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` used for venue photos must be
set. Proofs live under `shuttio/payment-proofs/<venueId>`. The bank list comes
from the public `https://api.vietqr.io/v2/banks` (cached 24 h).

Read via `ConfigService`, never raw `process.env`, per repo convention.

## 2. VietQR payment test procedure

1. Run `api` and `web` (`docker compose up --build` or separately).
2. As a **venue owner**: in setup (or the venue manage page) fill in the
   brand's bank account (bank, account number, account name). A venue
   without one cannot take online bookings.
3. As a **player**: book a court → the payment screen shows the venue's QR,
   account, amount and a unique memo (`SHT` + 6 chars). Upload a transfer
   screenshot (required) → the booking becomes `awaiting_venue_confirmation`
   and a `booking-<id>` chat opens with system messages and the image.
4. As the **venue owner**: open the reservation, view the proof, then
   - **approve** → `confirmed`; or
   - **reject** with a reason → `rejected_refund_pending`. The refund queue
     shows the player's account and a refund QR; transfer by hand and upload
     the refund screenshot → `refunded`.
5. As the **player**: press "Đã nhận lại tiền", or "Chưa nhận được" to open a
   complaint (admin → Khiếu nại → mark handled / dismiss — no money moves).
6. Leave a transfer unanswered past 12 h (or shorten `VENUE_ANSWER_HOURS` in
   dev): the sweeper moves it to `rejected_refund_pending` — it never
   auto-confirms. Halfway through, the venue gets a reminder.
7. Two players waiting on the same slot: approving one while the other is still
   waiting is allowed; approving a second booking for an already-confirmed slot
   is refused.

Automated tests cover the state machine, proof validation, the sweeper and the
chat (`api/test/bookings-service.test.ts`, `payments-service.test.ts`,
`bookings-sweeper.test.ts`, `booking-chat.test.ts`).

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
  against faked collaborators.
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

Once the booking-unification, endpoint-validation, VietQR, and scheduler
phases (2–5) have landed, run this against `docker compose up --build`:

- [ ] Book → transfer by VietQR + upload the screenshot → venue sees it waiting.
- [ ] Venue approves → booking `confirmed`; separately, let the 12-hour
      answer window elapse (shortened in dev) → moves to refund, never
      auto-confirms.
- [ ] Venue checks in → `checked-in` → `endAt` passes → auto-`completed`.
- [ ] Decline requires a reason (400 without one) → refund queue with QR →
      refund screenshot → player confirms receipt (or "not received" opens a
      complaint).
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
