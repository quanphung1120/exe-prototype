# Plan 018: Split setup into a Brand step and a per-Branch step

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 12d1c0e..HEAD -- web/features/venue/setup-wizard.tsx web/app/[locale]/setup/page.tsx web/features/venue/venue-actions.ts api/src/features/venues/venues.dto.ts api/src/features/venues/venues.service.ts`
> This plan assumes **plans 016 and 017 have already landed**: venue location
> fields are named `ward`/`province`, and `VenueStep` uses cascading province→
> ward `Select`s (not free-text). Confirm:
> `grep -n "PROVINCE_OPTIONS\|wardsOf\|venue.ward\|venue.province" web/features/venue/setup-wizard.tsx`
> must show the dropdowns and the `ward`/`province` fields. If not, STOP — run
> 016 then 017 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the provisioning contract; add-branch is the risky path)
- **Depends on**: `plans/016-*.md` and `plans/017-*.md` (both must be landed; run after 017)
- **Category**: direction / dx
- **Planned at**: commit `12d1c0e`, 2026-07-24

## Why this matters

A venue operator's account owns a **Brand** (thương hiệu) that groups one or
more **Venue branches** (chi nhánh) — the model already separates them. But the
setup wizard conflates the two: it asks for a single venue "name" and mints the
brand *named after that venue* (`provisionVenue` → `ensureBrand({ name:
input.name })`, `venues.service.ts:631`). So the brand's identity is an accident
of the first branch, and a location is demanded up front even though location is
a **branch** property, not a brand one.

The owner wants (confirmed this session) the natural shape: **first-time setup
asks brand identity + owner once; each branch asks its own name + location.**
This plan reorders the one wizard into a **Brand step** (shown only on first-time
setup) and a **Branch step** (name + the 017 location dropdowns + hours +
sports), gives the brand its own name field decoupled from the venue name, and
makes "add another branch" (`?branch=1`) skip the brand step entirely and reuse
the account's existing brand + owner.

## Current state

**`web/app/[locale]/setup/page.tsx`** decides first-time vs. add-branch from the
`?branch` search param and renders `<SetupWizard />` (no props today):
```tsx
const { branch } = await searchParams
if (!branch) {
  const venue = await fetchMyVenue()
  if (venue) redirect({ href: "/dashboard/venue", locale })
}
return <SetupWizard />
```

**`web/features/venue/setup-wizard.tsx`** — one wizard, 3 steps (`VenueStep`,
`CourtsStep`, `ReviewStep`). After plans 016/017 the branch draft is (names
post-016; province/ward now dropdown-driven):
```tsx
interface VenueDraft {
  name: string
  ward: string      // dropdown (017)
  province: string  // dropdown (017)
  sports: SportKey[]
  openFrom: string
  openTo: string
  managerName: string   // ← moves to the Brand step in this plan
}
// steps = [t("steps.venue"), t("steps.courts"), t("steps.review")]
// venueValid also checks `venue.managerName.trim().length >= 2`
// submit(): provisionVenue({ ...venue, courts })
```
`managerName` is rendered as the last field of `VenueStep`
(`FieldLabel htmlFor="v-mgr"`, `t("form.manager")` / `t("form.managerPlaceholder")`).

**`web/features/venue/venue-actions.ts`**:
```ts
export interface VenueInput {
  name: string; image?: string; description?: string
  ward: string; province: string; sports: SportKey[]
  openFrom: string; openTo: string; managerName: string
}
export interface VenueSetupInput extends VenueInput { courts: CourtInput[] }
export async function provisionVenue(input: VenueSetupInput): Promise<string> { … POST /api/venue/setup … }
```

**`api/src/features/venues/venues.dto.ts`** — `VenueInputDto.managerName` is
`@IsString() @Length(2, 60)` (required); `VenueSetupDto extends VenueInputDto`
adds `courts`.

**`api/src/features/venues/venues.service.ts`** — `provisionVenue(userId, input)`
(≈line 626):
```ts
const brand = await this.brands.ensureBrand(userId, {
  name: input.name, image: input.image, description: input.description,
})
const info = await this.createVenue({ ...input, ownerId: userId, brandId: brand.id })
```
`ensureBrand` (brands.service.ts:66) is idempotent: **if the account already has
a brand it returns it untouched** (line 67-68), ignoring `seed`. So on
add-branch, whatever brand name is passed is safely ignored. The owner's
existing branches are available via `this.myBranches(userId)` (used by
`myWorkspace`, venues.service.ts:410-418) — a `Promise<VenueInfo[]>`.

**Repo conventions**: NestJS services throw `HttpException`s
(`BadRequestException`, …) — never sentinels (`CLAUDE.md`). class-validator DTOs
with `@IsOptional()`; a subclass may re-declare a parent property with different
decorators to loosen it. Web: no semicolons, double quotes, `@/*` alias,
`"use client"`. The eslint rule bans sync `setState` in effects.

## Commands you will need

| Purpose         | Command                              | Expected on success |
|-----------------|--------------------------------------|---------------------|
| Web typecheck   | `cd web && pnpm typecheck`           | exit 0              |
| Web lint        | `cd web && pnpm lint`                | exit 0              |
| Web build       | `cd web && pnpm build`               | exit 0              |
| Web tests       | `cd web && pnpm test`                | all pass            |
| API typecheck   | `cd api && pnpm typecheck`           | exit 0              |
| API lint        | `cd api && pnpm lint`                | exit 0              |
| API tests       | `cd api && pnpm test`                | all pass            |

## Scope

**In scope**:
- `web/app/[locale]/setup/page.tsx` (edit) — pass `addingBranch` to the wizard.
- `web/features/venue/setup-wizard.tsx` (edit) — Brand step + Branch step +
  conditional step list + brandName.
- `web/features/venue/venue-actions.ts` (edit) — add `brandName?`, make
  `managerName?` optional on the setup input.
- `web/messages/en.json`, `web/messages/vi.json` (edit) — new step + form keys.
- `api/src/features/venues/venues.dto.ts` (edit) — `VenueSetupDto`: optional
  `brandName`, optional `managerName`.
- `api/src/features/venues/venues.service.ts` (edit) — `provisionVenue`: use
  `brandName`, reuse manager on add-branch.
- `api/test/*.test.ts` (edit/create) — cover the add-branch manager reuse.

**Out of scope** (do NOT touch):
- The `province`/`ward` **dropdowns/dataset** (plan 017) and field **names**
  (plan 016).
- `Brand` schema/type — no new brand fields (manager stays a venue property).
- `createVenue`, `updateVenue`, `VenueInputDto`/`VenuePatchDto` required-ness
  for the **non-setup** routes — only `VenueSetupDto` loosens `managerName`.
- The redirect/gate architecture — first-time setup still creates brand +
  first branch together (no brand-with-zero-venues support).

## Git workflow

- Branch: `advisor/018-setup-brand-branch-steps`
- Commit style matches the repo; e.g. `feat: separate brand and branch steps in venue setup`.
  End the commit body with: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: API — loosen the setup DTO

In `api/src/features/venues/venues.dto.ts`, in `VenueSetupDto` (which extends
`VenueInputDto`), **re-declare** `managerName` as optional and add an optional
`brandName`:
```ts
export class VenueSetupDto extends VenueInputDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CourtInputDto)
  courts: CourtInputDto[]

  /** Brand name (thương hiệu) — only sent on first-time setup; ignored once the
   *  account already has a brand (ensureBrand is idempotent). */
  @IsOptional() @IsString() @Length(2, 60)
  brandName?: string

  /** Manager/owner — required on first-time setup; on add-branch it is reused
   *  from the account's existing branch, so it may be omitted here. */
  @IsOptional() @IsString() @Length(2, 60)
  declare managerName?: string
}
```
(`declare` re-types the inherited required `managerName` as optional; the
`@IsOptional()` on the subclass property governs validation.)

**Verify**: `cd api && pnpm typecheck` → exit 0.

### Step 2: API — brandName + manager reuse in `provisionVenue`

In `venues.service.ts` `provisionVenue`, before `ensureBrand`/`createVenue`,
resolve the manager and brand name, reusing the existing branch's manager on
add-branch and rejecting a first-time setup with no manager:
```ts
const branches = await this.myBranches(userId)
const managerName = input.managerName ?? branches[0]?.manager.name
if (!managerName) {
  throw new BadRequestException("managerName is required for the first branch")
}
const brand = await this.brands.ensureBrand(userId, {
  name: input.brandName ?? input.name,   // brandName on first-time; ignored if brand exists
  image: input.image,
  description: input.description,
})
const info = await this.createVenue({
  ...input,
  managerName,                            // resolved (provided or reused)
  ownerId: userId,
  brandId: brand.id,
})
```
Adjust the `VenueSetupInput` service interface (venues.service.ts, near line 69)
so `managerName`/`brandName` are optional there too, matching the DTO. Ensure
`BadRequestException` is imported (it is used elsewhere in the file).

**Verify**: `cd api && pnpm typecheck && pnpm lint` → exit 0.

### Step 3: API — test the add-branch manager reuse

Add tests (follow the structure of an existing venues test under `api/test/` —
find one that exercises `provisionVenue`/setup; if none, model after the closest
service test). Cover:
- First-time setup with `brandName` set and `managerName` set → brand is named
  from `brandName` (not the venue name); the venue's `manager.name` is the given
  managerName.
- First-time setup with **no** `managerName` → `provisionVenue` throws
  `BadRequestException`.
- Add-branch (same `userId`, brand already exists) with **no** `managerName` and
  **no** `brandName` → succeeds; the new branch's `manager.name` equals the
  first branch's manager; the brand name is unchanged (still the original).

**Verify**: `cd api && pnpm test` → all pass, including the new cases.

### Step 4: Web — pass `addingBranch` to the wizard

In `web/app/[locale]/setup/page.tsx`, pass the flag:
```tsx
return <SetupWizard addingBranch={Boolean(branch)} />
```

**Verify**: `cd web && pnpm typecheck` → **fails** (SetupWizard has no
`addingBranch` prop yet — expected; Step 5 adds it).

### Step 5: Web — Brand step + conditional step list

In `web/features/venue/setup-wizard.tsx`:

1. Add the prop: `export function SetupWizard({ addingBranch }: { addingBranch: boolean })`.
2. Add brand state (first-time only fields):
   ```tsx
   const [brand, setBrand] = React.useState({ brandName: "", managerName: "" })
   ```
   and **remove `managerName` from `VenueDraft`** and from `VenueStep` (delete
   the `v-mgr` field there — it moves to the Brand step). Remove
   `venue.managerName` from `venueValid`.
3. Add a `BrandStep` component (render before the branch step) with two fields
   using the existing `Field`/`Input` primitives:
   - brand name → `t("form.brandName")`, placeholder `t("form.brandNamePlaceholder")`, bound to `brand.brandName`.
   - manager/owner → reuse `t("form.manager")` / `t("form.managerPlaceholder")`, bound to `brand.managerName`.
   with `brandValid = brand.brandName.trim().length >= 2 && brand.managerName.trim().length >= 2`.
4. Build the step list conditionally:
   ```tsx
   const steps = addingBranch
     ? [t("steps.venue"), t("steps.courts"), t("steps.review")]
     : [t("steps.brand"), t("steps.venue"), t("steps.courts"), t("steps.review")]
   ```
   Render `BrandStep` as the first step **only when `!addingBranch`**; keep
   `VenueStep` → `CourtsStep` → `ReviewStep` after it. Gate "Next" on the step's
   validity (`brandValid` for the brand step, `venueValid` for the branch step,
   `courts.length > 0` for courts). Keep the existing step-index math consistent
   with the conditional list (an offset of 0 when `addingBranch`, else 1).
5. In `submit()`, include brand fields **only on first-time**:
   ```tsx
   const payload = addingBranch
     ? { ...venue, courts }
     : { ...venue, brandName: brand.brandName, managerName: brand.managerName, courts }
   const venueId = await provisionVenue(payload)
   ```
6. `ReviewStep`: on first-time, show the brand name (e.g. above the venue block);
   it already shows `venue.ward · venue.province` (post-016/017). Add-branch
   review needs no brand line.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 6: Web — action types + i18n

1. `web/features/venue/venue-actions.ts`: on `VenueInput` (or a new
   `VenueSetupInput`), make `managerName?: string` optional and add
   `brandName?: string`. Simplest: keep `VenueInput` as-is for `updateVenue`,
   and change `VenueSetupInput` to:
   ```ts
   export interface VenueSetupInput extends Omit<VenueInput, "managerName"> {
     brandName?: string
     managerName?: string
     courts: CourtInput[]
   }
   ```
2. Add i18n keys to **both** `web/messages/en.json` and `web/messages/vi.json`
   under `VenueSetup`:
   - `steps.brand` — vi `"Thương hiệu"`, en `"Brand"`
   - `form.brandName` — vi `"Tên thương hiệu"`, en `"Brand name"`
   - `form.brandNamePlaceholder` — vi `"VD: Hệ thống sân Cầu Lông ABC"`, en `"e.g. ABC Badminton System"`
   (reuse the existing `form.manager` / `form.managerPlaceholder` for the owner
   field.) Keep the two catalogs key-for-key identical.

**Verify**: `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all pass.

## Test plan

- **API** (`api/test/`): the three `provisionVenue` cases in Step 3 (first-time
  with brand+manager, first-time missing manager → `BadRequestException`,
  add-branch reusing manager). Model after an existing venues/service test.
- **Web**: no new unit test is required (the wizard is UI), but if the repo has
  a component test harness that already covers the wizard, extend it to assert
  the Brand step appears only when `addingBranch={false}`. Otherwise rely on
  `pnpm build` + a manual `/setup` vs `/setup?branch=1` check.
- Verification: `cd api && pnpm test` and `cd web && pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` — all green; new
      add-branch/first-time provision tests exist and pass.
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build && pnpm test` — all green.
- [ ] `provisionVenue` uses `brandName`:
      `grep -n "brandName" api/src/features/venues/venues.service.ts` → at least one hit.
- [ ] Manager is no longer a Branch-step field:
      `grep -n "v-mgr" web/features/venue/setup-wizard.tsx` → **no output**
      (it moved to the Brand step; the input id changed or the field relocated).
- [ ] `SetupWizard` takes `addingBranch` and `setup/page.tsx` passes it:
      `grep -n "addingBranch" web/features/venue/setup-wizard.tsx web/app/[locale]/setup/page.tsx`
      → hits in both files.
- [ ] Both catalogs have `VenueSetup.steps.brand`, `VenueSetup.form.brandName`,
      `VenueSetup.form.brandNamePlaceholder`.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for 018 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 016/017 are not landed (drift check fails).
- `myBranches` does not exist or does not return the owner's venues with a
  `manager.name` — find the correct owner-scoped venue accessor and report which
  you used, or STOP if none fits.
- Re-declaring `managerName` as optional in `VenueSetupDto` does not actually
  loosen validation (a first-time setup with a manager still 400s, or add-branch
  without a manager still 400s) — the class-validator inheritance isn't behaving
  as assumed; report it.
- The conditional step-index math produces an off-by-one (wrong step renders) —
  if you can't reconcile it cleanly, report the step list you built.

## Maintenance notes

- The manager/owner is still a **per-branch** property (`venue.manager.name`);
  on add-branch it is *copied* from the first branch, not shared. If the product
  later wants a single brand-level owner-of-record, add `Brand.managerName` and
  derive branches from it (a small Brand `info` addition — no migration since
  `info` is Mixed) — this is the deliberate follow-up deferred here.
- `ensureBrand` ignores `brandName` once a brand exists, so there is no
  "rename my brand" path through setup — that would be a separate brand-edit
  surface (none exists today).
- A reviewer should scrutinize the add-branch path specifically: `/setup?branch=1`
  must NOT show the Brand step, must succeed without a manager field, and the new
  branch must inherit the correct brand + manager.
- First-time setup still hard-requires creating the first branch (with a
  location). Brand-with-zero-venues was explicitly rejected this session; if it
  ever comes back, it changes `fetchMyVenue`'s gate and the dashboard empty
  state.
