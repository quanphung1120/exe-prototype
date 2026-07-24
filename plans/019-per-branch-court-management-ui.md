# Plan 019: Per-branch court management UI (a "Sân" tab)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dc414a8..HEAD -- web/features/venue web/app/[locale]/dashboard/venue`
> If in-scope files changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (backend already exists; this is a new UI wired to existing actions)
- **Depends on**: none (enabler for plans 020 and 021)
- **Category**: direction / dx
- **Planned at**: commit `dc414a8`, 2026-07-24

## Why this matters

An operator can only add courts **during the setup wizard** — there is no
post-setup UI to add, edit, or remove a branch's courts. The backend fully
supports it (`addCourt`/`updateCourt`/`deleteCourt` server actions +
`/api/venues/:venueId/courts` REST + a per-court `archived` soft-delete), but no
screen wires to them. This plan adds a dedicated **"Sân" (Courts)** section to
the per-branch venue workspace: a table of the branch's courts with their live
state, plus add / edit / archive actions. It is the **enabler** for plan 020
(which removes the courts step from setup, so courts must be addable later) and
plan 021 (cross-branch court table).

## Current state

**Venue workspace nav** — `web/features/venue/nav.ts`. `VenueSectionKey` is a
string union; `venueNav(venueId)` returns the sidebar sections:
```ts
export type VenueSectionKey =
  "command" | "schedule" | "messages" | "analytics" | "customers"

export function venueNav(venueId: string): NavItem<VenueSectionKey>[] {
  const base = venueBase(venueId)
  return [
    { key: "command",   href: base,                 label: "Command Center", icon: LayoutDashboard, caption: "Your venue, live" },
    { key: "schedule",  href: `${base}/schedule`,   label: "Schedule",       icon: CalendarRange,   caption: "Grid and incoming requests" },
    { key: "messages",  href: `${base}/messages`,   label: "Messages",       icon: MessageSquare,   caption: "Chat with your players" },
    { key: "analytics", href: `${base}/analytics`,  label: "Insights",       icon: BarChart3,       caption: "Revenue, demand and players" },
    { key: "customers", href: `${base}/customers`,  label: "Customers",      icon: Users,           caption: "Manage players and customer relationships" },
  ]
}
```
Labels/captions resolve from the `VenueNav` i18n namespace by `key` (the nav
component looks up `VenueNav.<key>.label` / `.caption` — confirm by reading how
an existing key like `customers` is rendered; if the labels are hardcoded here
instead, match that).

**Route page pattern** — every section is a thin server component. Example
`web/app/[locale]/dashboard/venue/[venueId]/customers/page.tsx`:
```tsx
import { VenueCustomersView } from "@/features/venue/customers"
export async function generateMetadata({ params }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "VenueCustomers" })
  return { title: t("metaTitle"), description: t("metaDescription") }
}
export default async function VenueCustomersPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <VenueCustomersView />
}
```

**Court data + actions**:
- Read courts via `const { venueId, venueCourts } = useVenueData()`
  (`web/features/venue/venue-data-provider.tsx` — `venueCourts: VenueCourt[]`).
- `VenueCourt` (`web/lib/shared/types.ts`): `{ id, name, sport, surface, state, until?, occupant?, note?, utilToday, pricePerHour, archived? }`.
- `CourtState = "available" | "in-play" | "upcoming" | "maintenance"`.
- Server actions (`web/features/venue/venue-actions.ts`), already implemented:
  ```ts
  interface CourtInput { name: string; sport: SportKey; surface: string; pricePerHour: number; state?: VenueCourt["state"] }
  addCourt(venueId: string, input: CourtInput): Promise<VenueCourt>
  updateCourt(venueId: string, courtId: string, input: Partial<CourtInput>): Promise<VenueCourt>
  deleteCourt(venueId: string, courtId: string): Promise<void>   // soft-archive server-side
  ```
  Each already calls `revalidatePath(\`/dashboard/venue/${venueId}\`, "layout")`,
  so after an action the server re-renders with fresh `venueCourts` — no manual
  client cache update needed (mirror how `customers.tsx` calls `createCustomer`).

**Court form pattern to reuse** — the setup wizard's `CourtsStep`
(`web/features/venue/setup-wizard.tsx`) already renders a court draft form
(name `<Input>`, sport `<Select>` over `SPORTS`, surface `<Input>`,
pricePerHour numeric `<Input>` with `step={10000}`, `formatVnd`). Copy its field
layout for the add/edit dialog.

**Existing read-only court-state display** — `command.tsx:202-260` maps courts
into cards with a state pill (`courtStateAccent`/`courtStateLabel`, defined
`command.tsx:67-71`). You may lift those small style/label maps into
`web/features/venue/shared.tsx` if you want to share them with the new table;
otherwise re-derive them locally (do NOT edit `command.tsx` — out of scope).

**Repo conventions**: `"use client"` views; no semicolons, double quotes,
2-space indent, 80-col; Tailwind classes inside `cn()`; `@/*` alias. shadcn
primitives from `@/components/ui/*` (built on `@base-ui/react`). Money via
`formatVnd` (`@/features/dashboard/data`). Toasts via `sonner` (`toast.success`
/`toast.error`) — see `customers.tsx`/`manage.tsx`. Server-action calls wrapped
in `React.useTransition` (see `manage.tsx:36`). Vietnamese-first copy.

## Commands you will need

| Purpose       | Command                          | Expected           |
|---------------|----------------------------------|--------------------|
| Web typecheck | `cd web && pnpm typecheck`       | exit 0             |
| Web lint      | `cd web && pnpm lint`            | exit 0             |
| Web build     | `cd web && pnpm build`           | exit 0             |
| Web tests     | `cd web && pnpm test`            | all pass           |

Run from inside `web/`. First run `pnpm install` (fresh worktree has no
node_modules).

## Scope

**In scope**:
- `web/features/venue/nav.ts` (edit) — add the `courts` section.
- `web/app/[locale]/dashboard/venue/[venueId]/courts/page.tsx` (create) — route.
- `web/features/venue/courts.tsx` (create) — the `VenueCourtsView` (table + dialogs).
- `web/messages/en.json`, `web/messages/vi.json` (edit) — `VenueCourts` namespace + `VenueNav.courts` label/caption.
- Optionally `web/features/venue/shared.tsx` (edit) — only if you lift the shared court-state style/label maps there.

**Out of scope** (do NOT touch):
- `command.tsx`, `schedule.tsx`, `analytics.tsx`, `customers.tsx` — other views.
- `venue-actions.ts` and any api file — the backend already supports court CRUD; do not change it.
- The setup wizard (that is plan 020).
- The player-side discovery / AI (courts already flow there via `catalogCourts`).

## Git workflow

- Branch: `advisor/019-court-management-ui`
- Commit style e.g. `feat: per-branch court management (Sân tab)`. End commit body with `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR.

## Steps

### Step 1: Add the `courts` nav section

In `web/features/venue/nav.ts`: add `"courts"` to the `VenueSectionKey` union and
a nav entry positioned **after `schedule`** (matching the intended order
Command · Schedule · Sân · Messages · Insights · Customers). Use a grid icon
from `lucide-react` (e.g. `LayoutGrid`). Label "Sân" / caption per the i18n
convention the other entries follow.

**Verify**: `cd web && pnpm typecheck` → exit 0 (the union change compiles; if
the sidebar exhaustively switches on `VenueSectionKey` somewhere, the compiler
will point you at it — handle only what it flags, and if it's outside
`web/features/venue` / `web/features/dashboard`, STOP and report).

### Step 2: Create the route page

Create `web/app/[locale]/dashboard/venue/[venueId]/courts/page.tsx` mirroring the
`customers/page.tsx` shape above, with `namespace: "VenueCourts"` and rendering
`<VenueCourtsView />` from `@/features/venue/courts`.

**Verify**: file exists; `cd web && pnpm typecheck` → exit 0 after Step 3 creates
the view (it will error until then — that's expected).

### Step 3: Build `VenueCourtsView` (table + add/edit/archive)

Create `web/features/venue/courts.tsx` (`"use client"`). It:
1. Reads `const { venueId, venueCourts } = useVenueData()`.
2. Renders a **table** of the branch's non-archived courts: columns Tên, Môn
   (`tc("sports.<sport>")`), Mặt sân, Giá (`formatVnd`), Trạng thái (state pill),
   and a row action menu (Sửa / Lưu trữ). Use the shadcn `Table` primitive if
   present (`@/components/ui/table` — check; `admin/venues.tsx` uses it) else a
   simple responsive `<div>` grid. Show an empty state ("Chưa có sân nào — thêm
   sân đầu tiên") when `venueCourts.filter(c => !c.archived)` is empty.
3. An **"+ Thêm sân"** button opens a `Dialog` with the court form (copy
   `CourtsStep`'s fields: name, sport `Select`, surface, pricePerHour). On
   submit call `addCourt(venueId, draft)` inside `useTransition`, toast on
   success/error, close the dialog. `revalidatePath` in the action refreshes
   `venueCourts`.
4. **Edit**: the same dialog pre-filled; on submit call `updateCourt(venueId,
   court.id, patch)`.
5. **Archive**: a confirm `Dialog` (like `manage.tsx`'s archive confirm) → call
   `deleteCourt(venueId, court.id)` (server soft-archives). Do not offer a hard
   delete.

Match `customers.tsx` for the overall view/dialog structure and error handling.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → both exit 0.

### Step 4: i18n

Add a `VenueCourts` namespace to **both** `web/messages/en.json` and
`web/messages/vi.json` (metaTitle, metaDescription, title, subtitle, table
headers, add/edit dialog labels + placeholders, state labels
available/in-play/upcoming/maintenance, archive confirm text, empty state, toast
messages), and a `VenueNav.courts` `label`/`caption` matching how the other
`VenueNav.<key>` entries are shaped. Keep the two catalogs key-for-key identical.
Copy is Vietnamese-first.

**Verify**:
`node -e "const en=require('./web/messages/en.json'),vi=require('./web/messages/vi.json');function k(o,p=''){return Object.entries(o).flatMap(([kk,v])=>v&&typeof v=='object'&&!Array.isArray(v)?k(v,p+kk+'.'):[p+kk])}const e=new Set(k(en)),V=new Set(k(vi));console.log('onlyEn',[...e].filter(x=>!V.has(x)).length,'onlyVi',[...V].filter(x=>!e.has(x)).length)"`
→ prints `onlyEn 0 onlyVi 0`.

### Step 5: Full verification

`cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all pass.

## Test plan

- No new unit test is strictly required (UI wired to already-tested actions). If
  a web component-test harness exists, add one asserting the empty state renders
  when a branch has no courts and a row renders per court. Otherwise rely on
  `pnpm build` + a manual check at `/dashboard/venue/<id>/courts`.
- Manual (if a dev env is available): add a court → it appears in the table and
  in the Command Center grid; edit price → reflected; archive → row disappears.

## Done criteria

- [ ] `cd web && pnpm typecheck` exits 0
- [ ] `cd web && pnpm lint` exits 0
- [ ] `cd web && pnpm build` exits 0
- [ ] `cd web && pnpm test` — all pass
- [ ] `web/app/[locale]/dashboard/venue/[venueId]/courts/page.tsx` and
      `web/features/venue/courts.tsx` exist.
- [ ] `grep -n '"courts"' web/features/venue/nav.ts` → present in the union and a nav entry.
- [ ] `grep -n "addCourt\|updateCourt\|deleteCourt" web/features/venue/courts.tsx` → all three wired.
- [ ] i18n parity `onlyEn 0 onlyVi 0`; `VenueCourts` + `VenueNav.courts` present in both.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] `plans/README.md` status row for 019 updated.

## STOP conditions

Stop and report if:
- Adding `"courts"` to `VenueSectionKey` surfaces an exhaustive-switch error in a
  file outside `web/features/venue` / `web/features/dashboard`.
- `venue-actions.ts`'s court actions don't behave as documented (e.g. `deleteCourt`
  hard-deletes instead of archiving) — report rather than work around.
- There is no shadcn `Table` primitive and it's unclear which layout to use —
  report and default to the `admin/venues.tsx` table approach.

## Maintenance notes

- Plan 020 removes the courts step from setup and relies on this screen for
  post-setup court entry — keep the add flow prominent.
- Plan 021 (cross-branch court table) aggregates the same court/state data; if
  you extract shared state-label/style maps into `shared.tsx`, 021 can reuse them.
- A court's live `state` (`in-play`/`upcoming`) is driven by bookings/schedule,
  not directly editable here — this screen edits the court *record* (name,
  surface, price) and offers archive; `maintenance` blocks stay in the Schedule
  view (`addCourtBlock`). Don't add state-editing here without revisiting that.
