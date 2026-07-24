# Plan 020: Setup wizard — add multiple branches at once, drop the courts step

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dc414a8..HEAD -- web/features/venue/setup-wizard.tsx web/features/venue/venue-actions.ts api/src/features/venues/venues.dto.ts api/src/features/venues/venues.service.ts`
> This plan assumes **plan 019 has landed** (a post-setup "Sân" court-management
> screen exists at `/dashboard/venue/[venueId]/courts`). Confirm:
> `test -f web/app/[locale]/dashboard/venue/[venueId]/courts/page.tsx && echo OK`.
> If it prints nothing, STOP — run 019 first (without it, branches created here
> would have no way to ever get courts).

## Status

- **Priority**: P2
- **Effort**: M/L
- **Risk**: MED (changes the setup provisioning contract; add-branch is the risky path)
- **Depends on**: `plans/019-per-branch-court-management-ui.md` (must be landed)
- **Category**: direction
- **Planned at**: commit `dc414a8`, 2026-07-24

## Why this matters

Today the setup wizard creates exactly **one** branch and forces the operator to
add its courts inline before finishing (client requires `courts.length > 0`; DTO
`@ArrayMinSize(1)`). A brand with several locations must run setup repeatedly,
one branch at a time, and can't stand a branch up without immediately enumerating
courts. The desired flow (product decision, this session): setup collects the
**brand once, then a list of branches** (each = name + province/ward + hours +
sports), with **courts added later** on the per-branch "Sân" screen (plan 019).
A branch with no courts is a valid draft — and by rule **must not appear in
Explore or be fed to the AI** until it has courts. That rule already holds by
construction: discovery (`catalogCourts`, `venues.service.ts:471-478`) filters
`!court.archived && info.approval === "approved"`, so a 0-court (or still-pending)
branch contributes **zero** discovery courts. This plan makes setup multi-branch,
drops the courts step, and locks the empty-branch rule with a test.

## Current state (post-plan-018, at `dc414a8`)

**`api/src/features/venues/venues.dto.ts`** — `VenueSetupDto` currently carries
the single venue fields (via `OmitType(VenueInputDto, ["managerName"])`) plus
`brandName?`, `managerName?`, and `courts: CourtInputDto[]` with
`@IsArray() @ArrayMinSize(1) @ValidateNested`. `VenueInputDto` holds
`name, image?, description?, ward, province, sports, openFrom, openTo,
managerName` (post-016 field names).

**`api/src/features/venues/venues.service.ts` `provisionVenue(userId, input)`**
(≈line 631):
```ts
const branches = await this.myBranches(userId)
const managerName = input.managerName ?? branches[0]?.manager.name
if (!managerName) throw new BadRequestException("managerName is required for the first branch")
const brand = await this.brands.ensureBrand(userId, {
  name: input.brandName ?? input.name, image: input.image, description: input.description,
})
const info = await this.createVenue({ ...input, managerName, ownerId: userId, brandId: brand.id })
const courts: VenueCourt[] = []
for (const court of input.courts) courts.push(await this.addCourt(info.id, court))
await this.profiles.getProfile(userId)
await this.bookings.seedHistoricalBookings(info.id, courts, input.openFrom, input.openTo)
return this.venueBundle(info.id)
```
`seedHistoricalBookings` (`bookings.service.ts:530`) guards `if (!courts.length) return` — so zero courts is a safe no-op.

**`web/features/venue/venue-actions.ts`** — `VenueSetupInput` currently
`extends Omit<VenueInput, "managerName">` + `brandName?`, `managerName?`,
`courts: CourtInput[]`. `provisionVenue(input) → POST /api/venue/setup`, returns
`seed.info.id`.

**`web/features/venue/setup-wizard.tsx`** (post-018) — `stepKinds` is
`["brand","venue","courts","review"]` first-time / `["venue","courts","review"]`
add-branch. `BrandStep` (brandName + managerName), `VenueStep` (name + province/
ward dropdowns from plan 017 + sports + hours), `CourtsStep` (the court list),
`ReviewStep`. `VenueDraft = { name, ward, province, sports, openFrom, openTo }`.
`submit()` posts `{ ...venue, brandName, managerName, courts }` (first-time) or
`{ ...venue, courts }` (add-branch).

**Repo conventions**: NestJS services throw `HttpException`s; class-validator
DTOs (`@IsOptional`, `@ValidateNested`, `@Type`). Web `"use client"`, no
semicolons/double quotes/80-col, `@/*`, eslint bans sync `setState` in effects.
Vietnamese-first copy. The setup wizard already uses the "add item to a list"
pattern (the old CourtsStep) — reuse it for the **branches** list.

## Commands you will need

| Purpose       | Command                       | Expected |
|---------------|-------------------------------|----------|
| Web typecheck | `cd web && pnpm typecheck`    | exit 0   |
| Web lint      | `cd web && pnpm lint`         | exit 0   |
| Web build     | `cd web && pnpm build`        | exit 0   |
| Web tests     | `cd web && pnpm test`         | all pass |
| API typecheck | `cd api && pnpm typecheck`    | exit 0   |
| API lint      | `cd api && pnpm lint`         | exit 0   |
| API tests     | `cd api && pnpm test`         | all pass |

`pnpm install` in both `web/` and `api/` first (fresh worktree).

## Scope

**In scope**:
- `api/src/features/venues/venues.dto.ts` — restructure `VenueSetupDto` to carry `branches: BranchInputDto[]` (no courts); add `BranchInputDto`.
- `api/src/features/venues/venues.service.ts` — `provisionVenue` loops branches, no courts; adjust `VenueSetupInput`.
- `api/test/venue-setup-provisioning.test.ts` — update the existing 3 tests to the new shape; add multi-branch + empty-branch-not-in-catalog tests.
- `web/features/venue/venue-actions.ts` — `VenueSetupInput` → `{ brandName?, managerName?, branches: BranchInput[] }`.
- `web/features/venue/setup-wizard.tsx` — Brand step → **Branches list step** → Review; delete the CourtsStep and CourtDraft.
- `web/messages/en.json`, `web/messages/vi.json` — step/label changes; remove now-unused court-setup keys only if nothing else references them.

**Out of scope**:
- The per-branch "Sân" court screen (plan 019) — courts are added there now.
- `catalogCourts` / discovery / AI filtering logic — it already excludes 0-court and pending branches; do NOT add new filtering, just add a test.
- `createVenue`, `addCourt`, `VenueInputDto`/`VenuePatchDto`, non-setup routes.
- `seedHistoricalBookings` — leave as-is (it no-ops on zero courts).
- Court CRUD backend.

## Git workflow

- Branch: `advisor/020-setup-multi-branch`
- Commit style e.g. `feat: multi-branch setup, courts moved to dashboard`. End body with `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR.

## Steps

### Step 1: API — a `BranchInputDto` and a branches-based `VenueSetupDto`

In `venues.dto.ts`, add:
```ts
export class BranchInputDto {
  @IsString() @Length(2, 60) name: string
  @IsOptional() @IsString() @MaxLength(2048) image?: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsString() @Length(1, 60) ward: string
  @IsString() @Length(1, 60) province: string
  @IsArray() @ArrayMinSize(1) @IsIn(SPORTS, { each: true }) sports: SportKey[]
  @Matches(HHMM, { message: "openFrom: Expected HH:MM" }) openFrom: string
  @Matches(HHMM, { message: "openTo: Expected HH:MM" }) openTo: string
}
```
Replace `VenueSetupDto` so it no longer extends the single-venue DTO or carry
`courts`:
```ts
export class VenueSetupDto {
  @IsOptional() @IsString() @Length(2, 60) brandName?: string
  @IsOptional() @IsString() @Length(2, 60) managerName?: string
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BranchInputDto)
  branches: BranchInputDto[]
}
```
(`@ArrayMinSize(1)` on `branches`: setup must create at least one branch — a
brand with zero venues was explicitly rejected earlier.) Remove the now-unused
`CourtInputDto` import from `VenueSetupDto` only if nothing else in the file uses
it (`CourtInputDto` is still used by the court routes — keep the class).

**Verify**: `cd api && pnpm typecheck` → will fail in `venues.service.ts`
(provisionVenue still reads `input.courts`) — expected; fixed in Step 2.

### Step 2: API — `provisionVenue` loops branches, no courts

Rewrite `provisionVenue` to resolve the manager, ensure the brand once, then
create every branch (no courts, no historical seed). Land the operator on the
**first** created branch:
```ts
async provisionVenue(userId: string, input: VenueSetupInput): Promise<VenueSeed> {
  await this.ensureSeeded()
  const existing = await this.myBranches(userId)
  const managerName = input.managerName ?? existing[0]?.manager.name
  if (!managerName) throw new BadRequestException("managerName is required for the first branch")
  const brand = await this.brands.ensureBrand(userId, {
    name: input.brandName ?? input.branches[0]?.name, image: input.image, description: input.description,
  })
  const created: VenueInfo[] = []
  for (const b of input.branches) {
    created.push(await this.createVenue({ ...b, managerName, ownerId: userId, brandId: brand.id }))
  }
  await this.profiles.getProfile(userId)
  // No courts at setup time (VienTD/plan-020): branches start empty and are
  // excluded from discovery by `catalogCourts` until the operator adds courts
  // on the "Sân" screen. No historical bookings to seed.
  return this.venueBundle(created[0].id)
}
```
Update the service `VenueSetupInput` interface accordingly:
```ts
export interface VenueSetupInput {
  brandName?: string
  managerName?: string
  image?: string
  description?: string
  branches: Array<Omit<VenueInput, "managerName" | "ownerId" | "brandId" | "image" | "description">>
}
```
(`VenueInput`'s remaining fields per branch: `name, ward, province, sports,
openFrom, openTo`.) `createVenue` still validates `openFrom < openTo` per branch
and already accepts `ownerId`/`brandId`.

**Verify**: `cd api && pnpm typecheck && pnpm lint` → both exit 0.

### Step 3: API — update + extend the provisioning tests

In `api/test/venue-setup-provisioning.test.ts`, migrate the 3 existing tests to
the `branches: [...]` shape and add two:
- **Multi-branch**: first-time setup with `branches` of length 2 → both created
  under the same brand, both carry the resolved `managerName`; brand named from
  `brandName`.
- **Empty-branch rule**: after provisioning a branch with no courts, assert it
  does **not** appear in `catalogCourts()` (0 courts projected) — i.e.
  `(await service.catalogCourts()).filter(c => c.ward === <branch ward>)` is
  empty. (Model the mock so `catalogCourts` can run; if that's impractical with
  the in-memory mock, instead assert directly on the filter: a freshly created
  branch has `approval === "pending"` and no courts, both of which
  `catalogCourts` excludes — document which you asserted.)
- Keep: first-time-missing-manager → `BadRequestException`; add-branch reuses
  existing manager + leaves brand name unchanged.

**Verify**: `cd api && pnpm test` → all pass, including the new cases.

### Step 4: Web — setup wizard becomes Brand → Branches-list → Review

In `web/features/venue/setup-wizard.tsx`:
1. **Delete** `CourtsStep`, `CourtDraft`, and all court state/handlers.
2. Keep `BrandStep` (brandName + managerName, first-time only).
3. Turn the single branch into a **branches list**: state
   `const [branches, setBranches] = React.useState<VenueDraft[]>([])`, plus an
   inline "add a branch" sub-form (reuse the old `VenueStep` fields — name +
   province/ward dropdowns from plan 017 + sports + hours — as the draft form),
   an added-branches list with remove, exactly mirroring the removed CourtsStep's
   add/list/remove pattern. Require `branches.length >= 1` to finish.
4. `stepKinds`: first-time `["brand","branches","review"]`, add-branch
   `["branches","review"]`. Gate: `brandValid` on brand; `branches.length >= 1`
   on branches.
5. `submit()`:
   ```tsx
   const payload = addingBranch
     ? { branches }
     : { brandName: brand.brandName, managerName: brand.managerName, branches }
   const venueId = await provisionVenue(payload)   // lands on the first branch
   ```
6. `ReviewStep`: show the brand name (first-time) and the **list** of branches
   (each `name · ward · province · openFrom–openTo`), not courts.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → both exit 0.

### Step 5: Web — action type + i18n

1. `venue-actions.ts`: replace `VenueSetupInput` with
   `{ brandName?: string; managerName?: string; branches: BranchInput[] }` where
   `BranchInput = { name; ward; province; sports: SportKey[]; openFrom; openTo }`.
   `provisionVenue` still POSTs `/api/venue/setup` and returns `seed.info.id`.
2. i18n: rename the branch-list step key (`steps.venue` can stay as "Chi nhánh"),
   add `steps.branches` if you introduce a new key, add labels for the "add
   branch" sub-form / added list / "Thêm chi nhánh" button. **Remove** the
   `VenueSetup.courtForm.*` and courts-step keys **only** if grep shows nothing
   else references them. Keep both catalogs identical.

**Verify**: `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all pass.

### Step 6: Full verification (both apps)

- `cd api && pnpm typecheck && pnpm lint && pnpm test`
- `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Test plan

- **API**: the 5 cases in Step 3 (multi-branch, empty-branch-not-in-catalog,
  missing-manager 400, add-branch manager reuse, brand-named-from-brandName).
- **Web**: rely on `pnpm build` + typecheck; if a wizard component test exists,
  assert the courts step is gone and a second branch can be added to the list.
- Manual (if dev env): first-time setup adds 2 branches, finishes, lands on
  branch 1; both branches show 0 courts and are absent from Find Courts until
  courts are added on the "Sân" screen and the venue is approved.

## Done criteria

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` — all green; new multi-branch + empty-branch tests pass.
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build && pnpm test` — all green.
- [ ] `grep -n "courts" web/features/venue/setup-wizard.tsx` → no court-list step remains (only possibly a comment/link to the Sân screen).
- [ ] `grep -n "branches" api/src/features/venues/venues.dto.ts` → `VenueSetupDto.branches` present; `grep -n "ArrayMinSize(1)" ...dto.ts` still guards it.
- [ ] `grep -n "input.courts\|seedHistoricalBookings(info.id" api/src/features/venues/venues.service.ts` → no `input.courts` loop remains in `provisionVenue`.
- [ ] i18n parity `onlyEn 0 onlyVi 0`.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] `plans/README.md` status row for 020 updated.

## STOP conditions

Stop and report if:
- Plan 019 is not landed (`courts/page.tsx` absent).
- Restructuring `VenueSetupDto` breaks a consumer outside `venues.*`/the wizard
  (grep `VenueSetupDto`/`VenueSetupInput` usages first) — report it.
- `catalogCourts` turns out NOT to exclude a 0-court branch (the empty-branch
  rule would then need real filtering logic — that's a scope change; STOP and
  report what you observed).
- The `provisionVenue` return contract (`VenueSeed` of the first branch) is
  relied on by a caller expecting the old single-venue payload — report it.

## Maintenance notes

- Partial failure: `provisionVenue` creates branches in a loop, not a
  transaction. If branch 3 of 4 fails, branches 1–2 persist. For a prototype
  that's acceptable; if it matters later, wrap in a session/transaction or make
  the web submit branch-by-branch with resumable state. Flag in the PR.
- The empty-branch rule leans entirely on `catalogCourts`'s existing filters
  (`!archived && approval === "approved"` + `!court.archived`). If a future
  discovery path lists *venues* directly (not via courts), it must replicate the
  "has ≥1 non-archived court" guard — call this out wherever such a list is added.
- Brand image/description are still not collected in setup (optional, unused);
  a brand-profile edit screen is a separate follow-up.
- After this lands, the only way a branch becomes bookable is: add courts on the
  "Sân" screen (plan 019) **and** admin approval flips `approval` to `approved`.
