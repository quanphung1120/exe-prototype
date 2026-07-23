# Plan 005: Harden reschedule status check and IPN amount verification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- api/src/features/bookings/bookings.service.ts api/src/features/payments/`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + security (money path)
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

Two small money-path gaps:

1. **Reschedule TOCTOU**: `reschedule` verifies the booking's status on a lean
   read, then the guarded `findOneAndUpdate` matches only
   `{ bookingId, venueId }` — if the sweeper or a concurrent operator action
   cancels/expires/completes the booking in between, reschedule still rewrites
   its slot fields, silently corrupting a terminal booking.
2. **IPN settles without amount verification**: `markPaid` flips a payment to
   `paid` off the HMAC-verified SePay notification without comparing the
   settled amount to the `Payment.amount` recorded at checkout. A short-settled
   order would still confirm the booking.

Both fixes are one-filter/one-guard changes with unit tests.

## Current state

- `api/src/features/bookings/bookings.service.ts` — the reschedule method
  (~line 769). The status gate on the lean read:

```ts
if (!BookingsService.RESCHEDULABLE_STATUSES.includes(existing.status)) {
  throw new ConflictException(
    `Không thể đổi giờ đặt sân ở trạng thái "${existing.status}"`
  )
}
```

  then inside `writeWithOverlapGuard`'s callback (~line 816):

```ts
const query = this.bookingModel.findOneAndUpdate(
  { bookingId, venueId },
  { $set },
  { new: true }
)
const doc = await (session ? query.session(session) : query)
if (!doc) throw new NotFoundException("Reservation not found")
```

  `RESCHEDULABLE_STATUSES` is a static array on `BookingsService` (find it
  near the top of the class).

- `api/src/features/payments/payments.service.ts:279-289` — `markPaid`:

```ts
const updated = await this.paymentModel.findOneAndUpdate(
  { invoiceNumber, status: "awaiting" },
  { $set: { status: "paid", paidAt: vnNowIso(), ipnPayload: rawPayload } },
  { new: true }
)
if (!updated) return null
```

  Called from two places: the IPN handler (`handleIpn`, which passes the
  parsed `SepayIpnPayload`) and the `byBooking` reconciliation fallback.
  The payload type in `api/src/features/payments/sepay.client.ts` has
  `order_amount?: number` (line ~32) on the order object, in VND (the client
  sends `order_amount: input.amountVnd` at checkout, line ~96). The `Payment`
  schema stores `amount` (VND) at checkout.

- Conventions: ESM `.js` import extensions; Nest `HttpException`s; the IPN
  handler must stay ack-friendly — it returns `{ received: true }` and does
  not throw for business mismatches (SePay would retry); log instead.
- Tests: `api/test/bookings-service.test.ts` (large, has `makeQuery` chainable
  fake-model helpers) and `api/test/payments-service.test.ts` (fakes
  `SEPAY_CLIENT`; header explains no test may hit the network). Model new
  tests on these.

## Commands you will need

| Purpose | Command (inside `api/`) | Expected |
|---------|--------------------------|----------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Bookings tests | `node --import tsx --test test/bookings-service.test.ts` | all pass |
| Payments tests | `node --import tsx --test test/payments-service.test.ts` | all pass |
| All tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `api/src/features/bookings/bookings.service.ts` (reschedule's inner
  `findOneAndUpdate` filter only)
- `api/src/features/payments/payments.service.ts` (`markPaid` and/or its two
  callers)
- `api/test/bookings-service.test.ts`, `api/test/payments-service.test.ts`
  (extend)

**Out of scope**:
- `writeWithOverlapGuard` itself and every other booking mutation — the
  overlap-guard machinery is delicate and tested; only the reschedule filter
  changes.
- `sepay.client.ts` — types are already sufficient; no client change.
- The `ipnPayload` persistence (PII minimization) — separate concern, noted
  in the index as deferred.

## Git workflow

- Branch: `advisor/005-payments-hardening`
- Two commits (one per fix), e.g. `Re-check status atomically in booking
  reschedule` and `Verify settled amount before marking payment paid`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Atomic status re-check in reschedule

In the inner `findOneAndUpdate` (excerpt above), extend the filter to
`{ bookingId, venueId, status: { $in: BookingsService.RESCHEDULABLE_STATUSES } }`
and change the no-match throw from `NotFoundException("Reservation not found")`
to `ConflictException` with the same Vietnamese message pattern the lean-read
gate uses (the doc existed moments ago; a no-match here means the status
transitioned concurrently). Keep the lean-read gate as the fast path.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test the reschedule race

In `api/test/bookings-service.test.ts`, add a test: fake model whose lean
`findOne` returns a booking in a reschedulable status, but whose
`findOneAndUpdate` returns null (simulating the concurrent transition) —
assert `reschedule` rejects with `ConflictException` (not `NotFoundException`)
and assert the filter passed to `findOneAndUpdate` contains
`status: { $in: RESCHEDULABLE_STATUSES }`. Follow the file's existing
`makeQuery`/fake patterns.

**Verify**: `node --import tsx --test test/bookings-service.test.ts` → all
pass, including the new test.

### Step 3: Amount check before settle

In `payments.service.ts`, `markPaid` receives `rawPayload: unknown`. Change
the flow so amount verification happens where the typed payload exists:

- In `handleIpn` (the caller with the parsed `SepayIpnPayload`): after
  extracting `invoiceNumber`, read `payload.order?.order_amount`. Load the
  awaiting payment's stored `amount` (or pass the expected amount into
  `markPaid` — pick the smaller diff; passing an
  `expectedAmount?: number` argument into `markPaid` and comparing against
  `updated`'s pre-read is racy, so prefer: extend `markPaid`'s
  `findOneAndUpdate` filter with `...(typeof amount === "number" ? { amount } : {})`
  so a mismatched amount simply doesn't match the awaiting payment).
- On no-match where the invoice exists but the amount differed, log a
  `this.logger.error` naming the invoice, expected vs reported amount — and
  still return `{ received: true }` from the IPN (ack, don't retry-loop).
  Distinguishing "already settled/unknown invoice" (existing silent behavior)
  from "amount mismatch" requires one extra `findOne` on the miss path — do
  that only when `markPaid` returned null and an amount was provided.
- The `byBooking` reconciliation caller: it settles off SePay's order-status
  poll. If that response exposes a paid amount, pass it through identically;
  if it does not (check the types in `sepay.client.ts`), leave that caller
  passing `undefined` (no amount check) and note it in the code comment.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 4: Test the amount mismatch

In `api/test/payments-service.test.ts`, add: an IPN whose `order_amount`
differs from the stored payment's `amount` — assert the payment is NOT flipped
to paid (fake `findOneAndUpdate` receives a filter including the expected
`amount`, returns null), the handler still resolves `{ received: true }`, and
an error was logged. Plus one happy-path test where amounts match and settle
proceeds.

**Verify**: `node --import tsx --test test/payments-service.test.ts` → all
pass.

### Step 5: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

## Test plan

Steps 2 and 4. Three-plus new tests across the two existing test files,
following their established fake-model patterns.

## Done criteria

- [ ] Reschedule's `findOneAndUpdate` filter includes the reschedulable-status set; concurrent-transition no-match throws `ConflictException`
- [ ] An IPN with a mismatched `order_amount` does not settle the payment, is logged as an error, and is still acked
- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0 with the new tests
- [ ] `git status` shows only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drifted).
- `RESCHEDULABLE_STATUSES` includes statuses whose docs can legitimately lack
  slot fields such that the filter change breaks an existing test in a way
  that isn't a trivial fake-model update — report.
- SePay's IPN payload turns out to report amounts in a different unit or
  field than `order.order_amount` in VND (check `sepay.client.ts` types and
  the checkout call) — report rather than guess a conversion.

## Maintenance notes

- If partial payments/deposits are ever introduced, the equality check in
  Step 3 must become a >= or a ledger comparison — revisit.
- Reviewer: scrutinize that the IPN path still never throws for business
  mismatches (SePay retry storms), and that reconciliation (`byBooking`)
  behavior is unchanged when no amount is available.
- Deferred (recorded in index): persisting the full raw `ipnPayload`
  (PII minimization/TTL) — separate small plan if wanted.
