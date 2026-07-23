# Plan 003: Make discount usage-limit enforcement atomic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 07f8908..HEAD -- api/src/features/discounts api/src/features/payments/payments.service.ts`
> On changes, compare the "Current state" excerpts against live code first;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (money path)
- **Planned at**: commit `07f8908`, 2026-07-23

## Why this matters

A discount code's `usageLimit` is checked at validate/checkout time
(check-then-act) but the increment at payment settle is unconditional. Two
players checking out concurrently against a `usageLimit: 1` code both pass
validation, both pay, and both settle — the code is over-redeemed and
`usedCount` climbs past the limit. This is real money leakage that scales with
how widely a promo code is shared. The fix makes the increment conditional in
one atomic Mongo update and surfaces over-limit settlements to the log.

## Current state

- `api/src/features/discounts/discount.helpers.ts:79-84` — validate-time check
  (part of `assertDiscountApplicable`, thrown messages are Vietnamese):

```ts
if (
  discount.usageLimit !== undefined &&
  discount.usedCount >= discount.usageLimit
) {
  throw new BadRequestException("Mã đã hết lượt sử dụng")
}
```

- `api/src/features/discounts/discounts.service.ts:78-85` — the unconditional
  increment:

```ts
/** Increment `usedCount` for a code — called only once a payment is `paid`. */
async applyUsage(code: string): Promise<void> {
  await this.discountModel.updateOne(
    { code: code.trim().toUpperCase() },
    { $inc: { usedCount: 1 } }
  )
}
```

- `api/src/features/payments/payments.service.ts:290-300` — the only caller,
  inside `markPaid` after the payment settles; failures are logged, never
  thrown (the payment has already settled — a discount bookkeeping error must
  not fail the IPN):

```ts
if (updated.discountCode) {
  await this.discounts
    .applyUsage(updated.discountCode)
    .catch((err: unknown) => {
      this.logger.warn(
        `Failed to record discount usage for ${updated.discountCode} (booking ${updated.bookingId}): ${String(err)}`
      )
    })
}
```

- Conventions: api is native ESM — relative imports use `.js` extensions.
  Services throw Nest `HttpException`s; but here do NOT throw (see above —
  settle already happened). Prettier: no semicolons, double quotes.
- The `Discount` schema (`api/src/features/discounts/discount.schema.ts`) has
  optional `usageLimit?: number` and `usedCount: number` (default 0).

## Commands you will need

| Purpose | Command (inside `api/`) | Expected |
|---------|--------------------------|----------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| One test file | `node --import tsx --test test/discounts-service.test.ts` | all pass |
| All tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `api/src/features/discounts/discounts.service.ts`
- `api/src/features/payments/payments.service.ts` (only the `applyUsage`
  call-site logging)
- `api/test/discounts-service.test.ts` (create)

**Out of scope**:
- `discount.helpers.ts` — the validate-time check stays as the UX fast-path;
  do not move enforcement there.
- The `Discount` schema — no new fields.
- `web/**` — no client change; over-limit is a server-side bookkeeping event.

## Git workflow

- Branch: `advisor/003-discount-usage-race`
- One commit, e.g. `Enforce discount usageLimit atomically at settle`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make `applyUsage` conditional and report the outcome

Rewrite `applyUsage` in `discounts.service.ts` to gate the `$inc` on the limit
inside the filter and return what happened:

```ts
/**
 * Increment `usedCount` for a code — called only once a payment is `paid`.
 * The limit lives in the filter so the check and the increment are one
 * atomic update: `"applied"` means the increment landed within the limit,
 * `"over_limit"` means the code was already exhausted when this settlement
 * arrived (validate-time check raced another checkout), `"missing"` means
 * the code no longer exists.
 */
async applyUsage(code: string): Promise<"applied" | "over_limit" | "missing"> {
  const normalized = code.trim().toUpperCase()
  const res = await this.discountModel.updateOne(
    {
      code: normalized,
      $or: [
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
      ],
    },
    { $inc: { usedCount: 1 } }
  )
  if (res.modifiedCount > 0) return "applied"
  const exists = await this.discountModel.exists({ code: normalized })
  return exists ? "over_limit" : "missing"
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Log over-limit settlements at the call site

In `payments.service.ts`, keep the never-throw contract but log the returned
outcome: on `"over_limit"`, `this.logger.warn(...)` naming the code and
bookingId (this is the signal an operator uses to decide whether to honor or
refund the extra redemption — the payment has already settled). `"missing"`
also warrants a warn. `"applied"` stays silent. Keep the existing `.catch`
wrapper.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 3: Write `api/test/discounts-service.test.ts`

Model the file's structure on `api/test/payments-service.test.ts` (Node
`node:test` + `assert/strict`, `Test.createTestingModule` with
`getModelToken(Discount.name)` bound to a hand-rolled fake model — see that
file's `makeQuery`/fake-model pattern; also note its header comment style).
Import paths need `.js` extensions.

Cases (fake model records the filter it received):
1. `applyUsage` sends a filter containing the `$or` limit guard and the
   normalized (trimmed, upper-cased) code, with `$inc: { usedCount: 1 }`.
2. Fake `updateOne` → `{ modifiedCount: 1 }` ⇒ returns `"applied"`.
3. Fake `updateOne` → `{ modifiedCount: 0 }`, `exists` → truthy ⇒
   `"over_limit"`.
4. Fake `updateOne` → `{ modifiedCount: 0 }`, `exists` → null ⇒ `"missing"`.

Also add (or extend in `payments-service.test.ts` if easier) one test that an
`"over_limit"` result does not reject `markPaid`'s flow (settle still
succeeds).

**Verify**: `node --import tsx --test test/discounts-service.test.ts` → all
pass.

### Step 4: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0
(existing `payments-service.test.ts` must still pass — if it stubbed
`applyUsage` returning `void`, update the stub to return `"applied"`).

## Test plan

Covered by Step 3. New file `api/test/discounts-service.test.ts`, 4–5 tests.

## Done criteria

- [ ] `applyUsage` performs the limit check inside the `updateOne` filter (single atomic update)
- [ ] `payments.service.ts` warns on `"over_limit"` / `"missing"` and never throws from this path
- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0, including the new test file
- [ ] `git status` shows only the three in-scope files changed/created
- [ ] `plans/README.md` status row updated

## STOP conditions

- The live `applyUsage`/call-site code no longer matches the excerpts.
- The Mongo/Mongoose version in use rejects `$expr` inside an `updateOne`
  filter (typecheck or a test executing the real driver fails on it) —
  report; an alternative (aggregation-pipeline update) needs a human call.
- Any existing test fails for a reason unrelated to the `applyUsage` return
  type change.

## Maintenance notes

- If a discount-reservation step is ever added at checkout (reserving a
  redemption before payment), this settle-time guard becomes the fallback,
  not the primary enforcement — revisit then.
- Reviewer: confirm the never-throw contract at the `markPaid` call site is
  preserved, and that the code normalization (`trim().toUpperCase()`) matches
  what validate-time does.
- Deferred: an ops surface listing over-limit settlements (today: log line).
