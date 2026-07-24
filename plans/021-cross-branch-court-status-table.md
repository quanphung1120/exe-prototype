# Plan 021: Cross-branch court-status table in the Manage screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dc414a8..HEAD -- web/features/venue/manage.tsx api/src/features/venue-workspace api/src/features/venues/venues.service.ts`
> Compare the "Current state" excerpts against the live code before proceeding;
> on a mismatch, treat it as a STOP condition. Recommended to run **after plan
> 019** (shares the court-state label/style maps and links to the "Sân" tab).

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (additive read-only view + one owner-scoped read endpoint)
- **Depends on**: `plans/019-per-branch-court-management-ui.md` (soft — for the shared state labels and the "Sân" deep-link)
- **Category**: direction
- **Planned at**: commit `dc414a8`, 2026-07-24

## Why this matters

Every operator view is scoped to one branch (`venueId`); there is no place to see
**all of a brand's branches at once**. As brands gain multiple branches
(chi nhánh) — especially with plan 020 letting them create several at setup — the
operator needs a bird's-eye table: each branch, its court count, and how many
courts are in each state, plus a flag for **empty branches** (0 courts → not yet
shown on Explore / not fed to the AI). Branch *management* stays the existing
workspace-switch model (sidebar switcher → `/dashboard/venue/[venueId]/*`); this
table is the **hub** that shows the whole brand and lets the operator click into
a branch to manage its courts (the plan-019 "Sân" tab). Per the design decision
this session, it lives in the **Manage** screen (reached from the switcher), not
a new top-level route.

## Current state

**Courts are stored on each venue doc at `ops.courts`** — `venue.schema.ts:32`
(`ops: VenueOps`, a Mixed sub-doc); `VenueOps.courts: VenueCourt[]`
(`api/src/shared/types.ts:872`). `catalogCourts` reads `rec.ops.courts` and
filters `!rec.info.archived && rec.info.approval === "approved"` then
`!court.archived` (`venues.service.ts:471-478`).

**Owner's branches** — `venues.service.ts` has `myBranches(userId):
Promise<VenueInfo[]>` and `myWorkspace(userId): { brand, venues }`
(`:410-418`). `VenueInfo` = the venue `info` (id, name, ward, province, approval,
archived, …) but **not** its courts.

**Venue-workspace controller** — `api/src/features/venue-workspace/venue-workspace.controller.ts`
mounts owner-scoped reads at `/api/venue` (e.g. `GET /bundle`, `GET /:venueId/bundle`),
each using the `@UserId()` decorator. This is where a new owner-scoped summary
route belongs.

**Web server fetch pattern** — server components fetch via helpers in
`web/lib/api.ts` that attach the Clerk token (`authHeaders()` — `auth().getToken()`
as `Authorization: Bearer`). The venue seed is fetched server-side and handed to
providers; e.g. `fetchMyVenue()` already exists. Add a sibling
`fetchBranchesSummary()`.

**The Manage screen** — `web/features/venue/manage.tsx` is a `"use client"`
`VenueManageView()` taking no props today, reading `const { venueId, venue: VENUE }
= useVenueData()` (single branch: archive/restore). Its route is
`web/app/[locale]/dashboard/venue/[venueId]/manage/page.tsx` (a thin server
component rendering `<VenueManageView />`). The sidebar switcher navigates
branches via `goToBranch(v.id)` → `venueBase(v.id)` (`app-sidebar.tsx`).

**Court states** — `CourtState = "available" | "in-play" | "upcoming" |
"maintenance"` (`web/lib/shared/types.ts`). If plan 019 lifted state-label/style
maps into `web/features/venue/shared.tsx`, reuse them; else derive locally.

**Repo conventions**: NestJS owner-scoped reads via `@UserId()`; services return
plain objects; DTOs where input exists (this route takes no input). Web `"use
client"` views, server components fetch + pass props; no semicolons/double
quotes/80-col; `@/*`; Vietnamese-first copy; shadcn `Table` (`@/components/ui/table`,
used in `admin/venues.tsx`).

## Commands you will need

| Purpose       | Command                       | Expected |
|---------------|-------------------------------|----------|
| Web typecheck | `cd web && pnpm typecheck`    | exit 0   |
| Web lint      | `cd web && pnpm lint`         | exit 0   |
| Web build     | `cd web && pnpm build`        | exit 0   |
| API typecheck | `cd api && pnpm typecheck`    | exit 0   |
| API lint      | `cd api && pnpm lint`         | exit 0   |
| API tests     | `cd api && pnpm test`         | all pass |

`pnpm install` in both apps first.

## Scope

**In scope**:
- `api/src/features/venues/venues.service.ts` — add `branchesSummary(userId)`.
- `api/src/features/venue-workspace/venue-workspace.controller.ts` — add `GET /branches/summary`.
- `api/src/shared/types.ts` AND `web/lib/shared/types.ts` — add a `BranchSummary` type (keep the two copies identical).
- `api/test/*.test.ts` — test `branchesSummary` aggregation.
- `web/lib/api.ts` — `fetchBranchesSummary()`.
- `web/app/[locale]/dashboard/venue/[venueId]/manage/page.tsx` — fetch + pass the summary.
- `web/features/venue/manage.tsx` — render the cross-branch table.
- `web/messages/en.json`, `web/messages/vi.json` — table copy under `VenueManage`.

**Out of scope**:
- The per-branch court CRUD (plan 019) and setup (plan 020).
- Any new top-level route — the table lives in Manage (design decision).
- Discovery/AI filtering — unchanged.
- Editing courts from this table (it is read-only + navigation).

## Git workflow

- Branch: `advisor/021-cross-branch-court-table`
- Commit style e.g. `feat: cross-branch court-status table in Manage`. End body with `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR.

## Steps

### Step 1: Shared `BranchSummary` type (both copies)

In **both** `api/src/shared/types.ts` and `web/lib/shared/types.ts` add:
```ts
export interface BranchSummary {
  venueId: string
  name: string
  ward: string
  province: string
  approval?: VenueApprovalStatus
  archived?: boolean
  courtCount: number                        // non-archived courts
  stateCounts: Record<CourtState, number>   // available / in-play / upcoming / maintenance
}
```
Keep the two files identical (modulo the api copy's `.js`-less internal
references — match the surrounding style of each file).

**Verify**: `cd api && pnpm typecheck` and `cd web && pnpm typecheck` → exit 0.

### Step 2: API — `branchesSummary` service method

In `venues.service.ts`, add:
```ts
async branchesSummary(userId: string): Promise<BranchSummary[]> {
  const branches = await this.myBranches(userId)   // VenueInfo[], owner-scoped, ordered
  const docs = await this.venueModel.find({ ownerId: userId }).lean<VenueDocument[]>()
  const courtsByVenue = new Map(docs.map((d) => [d.venueId, d.ops?.courts ?? []]))
  return branches.map((info) => {
    const courts = (courtsByVenue.get(info.id) ?? []).filter((c) => !c.archived)
    const stateCounts = { available: 0, "in-play": 0, upcoming: 0, maintenance: 0 } as Record<CourtState, number>
    for (const c of courts) stateCounts[c.state] = (stateCounts[c.state] ?? 0) + 1
    return {
      venueId: info.id, name: info.name, ward: info.ward, province: info.province,
      approval: info.approval, archived: info.archived,
      courtCount: courts.length, stateCounts,
    }
  })
}
```
(Match how the file actually queries — if there's an existing owner-scoped doc
read that already returns `ops.courts`, reuse it instead of a second `find`.)

**Verify**: `cd api && pnpm typecheck && pnpm lint` → exit 0.

### Step 3: API — the route

In `venue-workspace.controller.ts` add an owner-scoped read:
```ts
@Get("branches/summary")
branchesSummary(@UserId() userId: string) {
  return this.venues.branchesSummary(userId)
}
```
Place it so it doesn't shadow `GET /:venueId/bundle` (a literal path segment
`branches/summary` won't collide with `:venueId/bundle`, but verify route order
if the framework is greedy).

**Verify**: `cd api && pnpm typecheck && pnpm lint` → exit 0.

### Step 4: API — test the aggregation

Add a test (model after `venue-setup-provisioning.test.ts` / an existing venues
service test): seed an owner with 2 branches — one with 2 courts (states
`available`, `in-play`) and one archived court (excluded), one with 0 courts —
assert `branchesSummary(userId)` returns `courtCount` 2 and 0 respectively, the
`stateCounts` match, and the archived court is not counted.

**Verify**: `cd api && pnpm test` → all pass, including the new case.

### Step 5: Web — fetch helper + wire into the Manage route

1. `web/lib/api.ts`: add `fetchBranchesSummary(): Promise<BranchSummary[]>`
   (server-only, `authHeaders()`, `GET /api/venue/branches/summary`), mirroring
   `fetchMyVenue()`.
2. `web/app/[locale]/dashboard/venue/[venueId]/manage/page.tsx`: call it and
   pass to the view: `<VenueManageView branches={await fetchBranchesSummary()} />`.

**Verify**: `cd web && pnpm typecheck` → fails until Step 6 adds the prop (expected).

### Step 6: Web — render the table in Manage

In `web/features/venue/manage.tsx`, add `branches: BranchSummary[]` to
`VenueManageView`'s props and render a **"Tổng quan chi nhánh"** table (above the
existing danger zone), using `@/components/ui/table`. Columns: Chi nhánh (name),
Khu vực (`ward · province`), Số sân (courtCount), a compact state breakdown
(e.g. state pills with counts), Trạng thái duyệt (approval), and a row click /
"Quản lý" link → `venueBase(b.venueId)` (or its `/courts` tab from plan 019) so
the operator switches into that branch's workspace. For `courtCount === 0`, show
a muted badge "Chưa có sân — chưa hiển thị trên Explore". Highlight the current
`venueId` row. Keep the archive/restore section unchanged below.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 7: i18n + full verification

Add the table copy under `VenueManage` in both catalogs (overview title,
column headers, the empty-branch badge, the "Quản lý" link label). Keep the two
catalogs identical.

**Verify**:
- `node -e "const en=require('./web/messages/en.json'),vi=require('./web/messages/vi.json');function k(o,p=''){return Object.entries(o).flatMap(([kk,v])=>v&&typeof v=='object'&&!Array.isArray(v)?k(v,p+kk+'.'):[p+kk])}const e=new Set(k(en)),V=new Set(k(vi));console.log('onlyEn',[...e].filter(x=>!V.has(x)).length,'onlyVi',[...V].filter(x=>!e.has(x)).length)"` → `onlyEn 0 onlyVi 0`
- `cd api && pnpm typecheck && pnpm lint && pnpm test`
- `cd web && pnpm typecheck && pnpm lint && pnpm build`

## Test plan

- **API**: the aggregation test in Step 4 (multi-branch counts, archived-court
  exclusion, 0-court branch).
- **Web**: rely on `pnpm build` + typecheck; manual check that the Manage screen
  shows every branch, the empty-branch badge appears for a court-less branch, and
  a row links into that branch's workspace.

## Done criteria

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` — all green; new aggregation test passes.
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build` — all green.
- [ ] `grep -n "branchesSummary" api/src/features/venues/venues.service.ts api/src/features/venue-workspace/venue-workspace.controller.ts` → hits in both.
- [ ] `grep -n "BranchSummary" api/src/shared/types.ts web/lib/shared/types.ts` → present in both copies.
- [ ] `grep -n "branches" web/features/venue/manage.tsx` → the table renders `branches`.
- [ ] i18n parity `onlyEn 0 onlyVi 0`.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] `plans/README.md` status row for 021 updated.

## STOP conditions

Stop and report if:
- A venue doc's courts are NOT at `ops.courts` (the excerpt is wrong) — find the
  real source `catalogCourts` iterates and report it.
- `GET /branches/summary` collides with the `:venueId` param route (framework
  matches `branches` as a venueId) — report and try a non-colliding path like
  `/summary/branches`.
- The Manage route can't be made a server component that fetches (e.g. it's
  forced client-only) — report; the fallback is a client fetch in the view.

## Maintenance notes

- The summary counts the **stored** `court.state`, which reflects live
  occupancy at read time (driven by bookings/schedule). It's a snapshot, not
  realtime — fine for an overview; note it in the UI if operators expect live.
- If plan 020 lands first, brand-new branches show `courtCount: 0` + the badge —
  which is exactly the signal the operator needs to go add courts. Keep the
  "Quản lý"/link pointing at the branch's "Sân" tab so the next action is obvious.
- Reviewer should confirm the new route is owner-scoped (only the caller's own
  branches) and doesn't leak other brands' branches.
