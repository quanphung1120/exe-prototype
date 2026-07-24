# Plan 017: Vietnam new-units dataset + cascading province→ward dropdowns in setup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 12d1c0e..HEAD -- web/features/venue/setup-wizard.tsx`
> This plan assumes **plan 016 has already landed** (venue location fields are
> named `ward`/`province`, not `district`/`city`). Confirm before starting:
> `grep -n "ward\|province" web/features/venue/setup-wizard.tsx` must show the
> `VenueDraft` has `ward` and `province` fields. If it still says
> `district`/`city`, STOP — run plan 016 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (introduces a bundled dataset; the risk is sourcing correct data)
- **Depends on**: `plans/016-rename-district-city-to-ward-province.md` (must be landed)
- **Category**: dx / direction
- **Planned at**: commit `12d1c0e`, 2026-07-24

## Why this matters

In the venue-owner setup wizard, the two location fields (province and ward,
post-016) are free-text `<Input>`s — the owner types "Hà Nội" and a ward name by
hand. That is error-prone, produces inconsistent strings (a venue typed
"TP HCM" won't match a court filtered on "TP. Hồ Chí Minh"), and doesn't reflect
that Vietnam's administrative units are a **fixed, known list** after the 2025
reform: 34 provinces/cities, each with a fixed set of wards/communes. This plan
replaces the two free-text inputs with **cascading dropdowns**: pick a province,
and the ward dropdown loads that province's wards (owner's stated requirement:
"when select a city, it will load ward of that city"). The data is bundled
statically so it works offline / in Docker and is deterministic for SSR (per
`CLAUDE.md`, seed/config values must be deterministic — no runtime fetch).

## Current state

`web/features/venue/setup-wizard.tsx` — the `VenueStep` component renders two
free-text inputs for location. **After plan 016** the fields are `ward` and
`province` (this plan assumes that). The shape to replace looks like (field
names post-016):

```tsx
// VenueDraft (post-016): { name, ward, province, sports, openFrom, openTo, managerName }
// state init default: province: "Hà Nội"  (a free string)

<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
  <Field>
    <FieldLabel htmlFor="v-ward">{t("form.ward")}</FieldLabel>
    <Input id="v-ward" value={venue.ward} autoComplete="off"
      onChange={(e) => setField("ward", e.target.value)} />
  </Field>
  <Field>
    <FieldLabel htmlFor="v-province">{t("form.province")}</FieldLabel>
    <Input id="v-province" value={venue.province} autoComplete="off"
      onChange={(e) => setField("province", e.target.value)} />
  </Field>
</div>
```

The file **already imports the shadcn `Select`** and uses it for the court
"sport" picker (`CourtsStep`) — copy that pattern. The import block:
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
```
Example `Select` usage in the same file (the pattern to follow):
```tsx
<Select value={draft.sport} onValueChange={(v) => setDraft((d) => ({ ...d, sport: v as SportKey }))}>
  <SelectTrigger className="w-full">
    <SelectValue>{(v) => tc(`sports.${v as SportKey}`)}</SelectValue>
  </SelectTrigger>
  <SelectContent>
    {SPORTS.map((s) => (
      <SelectItem key={s.key} value={s.key}>{tc(`sports.${s.key}`)}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**The venue model stores location as name strings** (`Venue.province`,
`Venue.ward` are `string` — plan 016), and courts denormalize those names. So
the dropdowns must **store the selected unit's display name** (e.g.
`"Thành phố Hà Nội"`), not an internal code, to stay compatible with everything
downstream. Use codes only as `<SelectItem value>` keys internally.

**Repo conventions**: no semicolons, double quotes, 2-space indent, 80-col,
Tailwind classes inside `cn()`; `@/*` alias. The setup wizard is a
`"use client"` component. The repo eslint **errors on synchronous `setState`
inside an effect** — do not add such an effect; derive the ward list during
render from the selected province (see Step 3).

## Commands you will need

| Purpose         | Command                              | Expected on success |
|-----------------|--------------------------------------|---------------------|
| Web typecheck   | `cd web && pnpm typecheck`           | exit 0, no errors   |
| Web lint        | `cd web && pnpm lint`                | exit 0              |
| Web build       | `cd web && pnpm build`               | exit 0              |
| Web tests       | `cd web && pnpm test`                | all pass            |
| JSON sanity     | `node -e "…"` (given in steps)       | prints expected     |

Run from inside `web/`.

## Suggested executor toolkit

- The dataset is large-ish; keep it **out of the initial JS bundle** by loading
  the JSON lazily inside the client component (dynamic `import()`), or importing
  the JSON module directly and letting Next code-split the setup route. Prefer
  the `next-best-practices` guidance for client-component data if available.

## Scope

**In scope**:
- `web/lib/vn-admin/units.json` (create) — the bundled dataset.
- `web/lib/vn-admin/index.ts` (create) — typed accessors over the dataset.
- `web/lib/vn-admin/index.test.ts` (create) — dataset shape tests.
- `web/features/venue/setup-wizard.tsx` (edit) — replace the two free-text
  location inputs with cascading dropdowns.

**Out of scope** (do NOT touch):
- The `province`/`ward` field **names** or any other entity — that was plan 016.
- Seed data place-name **values** in `api/src/data/*` — leave the demo data as
  is (refreshing it to real new-units would desync the AI matchmaking demo,
  which still uses district-level place names; deliberately deferred).
- The setup wizard's **step structure** (brand vs branch reorder) — that is
  plan 018.
- The venue "edit" surface — there is no rendered location-edit form today
  (`manage.tsx` only archives/restores).

## Git workflow

- Branch: `advisor/017-vn-admin-dropdowns`
- Commit style matches the repo; e.g. `feat: cascading province/ward dropdowns in venue setup`.
  End the commit body with: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Vendor the Vietnam new-units dataset

Create `web/lib/vn-admin/units.json` containing the **2025 two-tier**
administrative units: every province/city (34 of them) with its wards/communes.
Required JSON shape (array of provinces):

```json
[
  {
    "code": "01",
    "name": "Thành phố Hà Nội",
    "wards": [
      { "code": "00004", "name": "Phường Ba Đình" },
      { "code": "00008", "name": "Phường Ngọc Hà" }
    ]
  }
]
```

`code` values are opaque stable keys (any unique string per unit is fine —
prefer the official GSO codes if the source provides them). `name` is the
official Vietnamese display name and is what gets stored on the venue.

**How to obtain the data** (do NOT hand-type 3,000+ wards):
- Preferred: fetch a free, open, **post-July-2025** dataset that already
  reflects the 34-province merger, and transform it into the shape above.
  Candidate sources to try (verify each returns the **new** 34-province
  structure with wards, not the old 63-province/district data):
  - the `provinces.open-api.vn` project's v2 dataset (province → ward, depth 2),
  - an open GitHub JSON dataset of the 2025 reorganized units.
- Transform to exactly the shape above (drop any district/level-2 layer — the
  new structure is province → ward only).

**If you cannot obtain a complete, verifiable post-2025 dataset** (no network,
source is stale/ambiguous, or you cannot confirm it is the 34-province
structure): **STOP and report** — ask the operator to drop the JSON in at
`web/lib/vn-admin/units.json`. Do **not** fabricate ward names or ship a partial
list silently.

**Verify** the file is well-formed and complete:
```
node -e "const d=require('./web/lib/vn-admin/units.json'); const n=d.length; const w=d.reduce((s,p)=>s+p.wards.length,0); if(n!==34) throw new Error('expected 34 provinces, got '+n); if(w<1000) throw new Error('too few wards: '+w); if(!d.every(p=>p.code&&p.name&&Array.isArray(p.wards)&&p.wards.every(x=>x.code&&x.name))) throw new Error('bad shape'); console.log('OK: '+n+' provinces, '+w+' wards')"
```
→ prints `OK: 34 provinces, <N> wards`. (If the number of provinces is
legitimately not 34 because of a later reform, note it in your report and adjust
the check — but the 2025 reform result is 34.)

### Step 2: Add typed accessors

Create `web/lib/vn-admin/index.ts`:

```ts
import units from "./units.json"

export interface Ward {
  code: string
  name: string
}
export interface Province {
  code: string
  name: string
  wards: Ward[]
}

export const PROVINCES: Province[] = units as Province[]

/** Provinces without their (large) ward arrays — for the province dropdown. */
export const PROVINCE_OPTIONS: { code: string; name: string }[] = PROVINCES.map(
  (p) => ({ code: p.code, name: p.name })
)

/** Wards of a province, by province code (empty when none/unknown). */
export function wardsOf(provinceCode: string | undefined): Ward[] {
  if (!provinceCode) return []
  return PROVINCES.find((p) => p.code === provinceCode)?.wards ?? []
}

/** Province code for a stored province name (for re-hydrating a saved value). */
export function provinceCodeByName(name: string | undefined): string | undefined {
  if (!name) return undefined
  return PROVINCES.find((p) => p.name === name)?.code
}
```

**Verify**: `cd web && pnpm typecheck` → exit 0 (JSON module import resolves;
`resolveJsonModule` is on in Next's tsconfig — if typecheck complains the module
can't be found, STOP and report the tsconfig error rather than changing config).

### Step 3: Replace the two free-text inputs with cascading dropdowns

In `web/features/venue/setup-wizard.tsx`:

1. Import the accessors: `import { PROVINCE_OPTIONS, wardsOf, provinceCodeByName } from "@/lib/vn-admin"`.
2. In `VenueStep`, derive the selected province **code** from the stored
   province **name** during render (no effect, no setState-in-effect):
   ```tsx
   const provinceCode = provinceCodeByName(venue.province)
   const wardOptions = wardsOf(provinceCode)
   ```
3. Replace the province `<Input>` with a `Select` whose items are
   `PROVINCE_OPTIONS`. On change, store the province **name** and clear the ward
   (a new province invalidates the old ward):
   ```tsx
   <Select
     value={provinceCode ?? ""}
     onValueChange={(code) => {
       const name = PROVINCE_OPTIONS.find((p) => p.code === code)?.name ?? ""
       setVenue((v) => ({ ...v, province: name, ward: "" }))
     }}
   >
     <SelectTrigger className="w-full">
       <SelectValue placeholder={t("form.provincePlaceholder")} />
     </SelectTrigger>
     <SelectContent>
       {PROVINCE_OPTIONS.map((p) => (
         <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
       ))}
     </SelectContent>
   </Select>
   ```
   (Note: this clears both `province` and `ward` in one `setVenue` — do NOT use
   `setField` twice; a single functional update avoids the eslint sync-setState
   rule and a stale ward.)
4. Replace the ward `<Input>` with a `Select` populated from `wardOptions`,
   **disabled until a province is chosen**, storing the ward **name**:
   ```tsx
   <Select
     value={venue.ward}
     onValueChange={(name) => setField("ward", name)}
     disabled={wardOptions.length === 0}
   >
     <SelectTrigger className="w-full">
       <SelectValue placeholder={t("form.wardPlaceholder")} />
     </SelectTrigger>
     <SelectContent>
       {wardOptions.map((w) => (
         <SelectItem key={w.code} value={w.name}>{w.name}</SelectItem>
       ))}
     </SelectContent>
   </Select>
   ```
5. Change the state init default: `province: "Hà Nội"` → `province: ""` (nothing
   pre-selected; the placeholder prompts a choice). Leave `ward: ""`.
6. The existing `venueValid` check (`venue.province.trim().length >= 1 &&
   venue.ward.trim().length >= 1`) already gates "Next" correctly — a
   dropdown either yields "" or a valid name, so no change needed.

Add the four new i18n keys to **both** `web/messages/en.json` and
`web/messages/vi.json` under `VenueSetup.form`:
- `provincePlaceholder` — vi `"Chọn tỉnh / thành phố"`, en `"Select province / city"`
- `wardPlaceholder` — vi `"Chọn phường / xã"`, en `"Select ward / commune"`

**Verify**: `cd web && pnpm typecheck && pnpm lint` → both exit 0.

### Step 4: Full verification

**Verify** (all pass):
`cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build`

If you have a browser/dev environment, also load `/setup` (or `/setup?branch=1`)
and confirm: the province dropdown lists provinces; picking one enables and
populates the ward dropdown with that province's wards; changing the province
resets the ward. (This manual check is optional — the build+typecheck are the
required gates.)

## Test plan

- New test file `web/lib/vn-admin/index.test.ts` (follow the structure of an
  existing web test, e.g. `web/lib/shared/helpers.test.ts` if present, else the
  simplest existing `*.test.ts` under `web/`). Cover:
  - `PROVINCE_OPTIONS.length === 34` (the fixed count).
  - Every `wardsOf(p.code)` is non-empty for every province.
  - `provinceCodeByName(PROVINCES[0].name)` round-trips to `PROVINCES[0].code`.
  - `wardsOf(undefined)` and `wardsOf("nope")` return `[]`.
  - No duplicate province `code`s.
- Verification: `cd web && pnpm test` → all pass, including the new file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `web/lib/vn-admin/units.json` exists; the Step-1 node check prints
      `OK: 34 provinces, <N> wards` with N ≥ 1000.
- [ ] `web/lib/vn-admin/index.ts` and `index.test.ts` exist.
- [ ] `cd web && pnpm typecheck` exits 0
- [ ] `cd web && pnpm lint` exits 0
- [ ] `cd web && pnpm build` exits 0
- [ ] `cd web && pnpm test` — all pass, including the new vn-admin tests
- [ ] `grep -n "id=\"v-ward\"\|id=\"v-province\"\|<Input" web/features/venue/setup-wizard.tsx`
      shows **no `<Input>`** for province/ward (they are now `Select`s); other
      `<Input>`s (name, manager, court fields) remain.
- [ ] Both message catalogs have `VenueSetup.form.provincePlaceholder` and
      `VenueSetup.form.wardPlaceholder`.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for 017 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 016 is not landed (fields still named `district`/`city`).
- You cannot obtain a complete, verifiable post-2025 (34-province) dataset —
  ask the operator to supply `units.json` rather than fabricating data.
- The JSON module import fails typecheck and the fix would require editing
  `tsconfig`/Next config (out of scope) — report it.
- Adding the province-change handler trips the repo's "no sync setState in
  effect" eslint rule — that means you added an effect; derive the ward list
  during render instead (Step 3.2) and report if you can't.

## Maintenance notes

- The dataset is a point-in-time snapshot of the 2025 units. If Vietnam
  reorganizes again, replace `units.json` (same shape) and update the `=== 34`
  count in the test and the Step-1 check.
- Venue location is stored as the province/ward **display name string**, chosen
  to stay compatible with the denormalized court/matchmaking fields. If a future
  change wants stable codes on the venue (e.g. for analytics grouping), add a
  `provinceCode`/`wardCode` alongside the names rather than replacing them.
- The ward dropdown is a plain listbox; some provinces have 100–300 wards. If
  operators find scrolling painful, a **searchable combobox** for the ward field
  is a clean follow-up (province is only 34, fine as a plain select).
- Bundle size: keep an eye that the JSON is code-split into the `/setup` route,
  not pulled into shared chunks. `pnpm build` route output should not balloon
  the shared bundle; if it does, switch `index.ts` to a lazy `import()` of the
  JSON inside the component.
