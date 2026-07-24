# Plan 016: Rename `district`/`city` → `ward`/`province` repo-wide

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 12d1c0e..HEAD -- web/lib/shared api/src/shared web/features api/src/features web/messages api/src/data`
> If any file listed in "Scope" changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (wide mechanical rename; the safety net is the compiler)
- **Depends on**: none
- **Category**: tech-debt / migration
- **Planned at**: commit `12d1c0e`, 2026-07-24

## Why this matters

Vietnam's 2025 administrative reform removed the district level: the fixed
structure is now two tiers — **Tỉnh/Thành phố** (province/city, 34 of them) →
**Phường/Xã** (ward/commune). This codebase models a venue/court location with
two free-string fields named `district` and `city`, a naming that no longer
matches the country's administrative reality. The owner (product decision, this
session) chose a **global rename**: `district → ward`, `city → province`, across
every entity and every consumer — so the whole codebase speaks the new
vocabulary. This plan does *only* the rename (identifiers), establishing the
`ward`/`province` names that plans **017** (dropdowns from the new-units dataset)
and **018** (setup flow reorder) build on. It changes **no behavior** — search,
matchmaking, and display work exactly as before, under new field names.

This is a pure identifier rename. **String literal *values* are data, not
identifiers, and are left untouched** here — place names like `"Quận 1"`,
`"Hà Nội"`, and the matchmaking alias `"District 7"` stay as-is (refreshing the
seed place-names to real new-units is deferred to plan 017's Step "seed
refresh", explicitly out of scope here).

## Current state

`district`/`city` are hand-duplicated across the two standalone apps
(`web/lib/shared/` and `api/src/shared/` are manual copies kept in sync — see
`CLAUDE.md`). They live on **five** shared interfaces and are denormalized onto
courts/sessions/reservations/rooms, then read by matchmaking, the AI chat tools,
Find Courts, booking search, admin tables, the sidebar, and seed data.

**The type definitions** (`web/lib/shared/types.ts`, mirrored byte-for-byte by
`api/src/shared/types.ts`):

- `User.city` — `types.ts:32`
- `Court.district` / `Court.city` — `types.ts:76` / `types.ts:78`, with doc
  comments:
  ```ts
  /** Cấp quận/huyện — full Vietnamese name e.g. "Quận 1", "Quận Bình Thạnh", "Thành phố Thủ Đức" */
  district: string
  /** Tỉnh/thành phố trực thuộc trung ương — e.g. "TP. Hồ Chí Minh", "Hà Nội" */
  city: string
  ```
- `MatchRoom.district` — `types.ts:105`
- A reservation/session interface `district` — `types.ts:245`
- `Venue.district` / `Venue.city` — `types.ts:382` / `types.ts:383`

**The venue→court denormalization seam** — `web/lib/shared/helpers.ts` (mirrored
by `api/src/shared/helpers.ts`), lines `629`, `723`, `764`, `1014-1015`, e.g.:
```ts
// helpers.ts:1014-1015 — court inherits the venue's location
district: venue.district,
city: venue.city,
```

**Real Mongoose columns** (not a Mixed blob) — `api/src/features/courts/court.schema.ts:15-16`:
```ts
@Prop({ required: true }) district: string
@Prop({ required: true }) city: string
```
and the projection at `court.schema.ts:39-40`. (Venue/Brand store location
inside a `Mixed` `info` blob — `venue.schema.ts` — so those need **no** schema
migration, only the shared-type + service changes.)

**The AI chat tool contract** — `api/src/features/ai/ai.service.ts`: the
`findCourts` and `findRooms` tools declare a `district` parameter
(`ai.service.ts:263`, `:413`) with descriptions, filter on `court.district`
(`:313`, `:432`), and return `districtMatched` (`:347`, `:441`) and
`district: court.district` (`:515`). Renaming the tool **parameter** changes the
LLM tool schema (the owner accepted this). The example place-name **values** in
the descriptions/prompt (`"Quận 3"`, `"Bình Thạnh"`) are data — leave them.

**Repo conventions**: no semicolons, double quotes, 2-space indent, 80-col
(Prettier — `.prettierrc` in each app). `api` uses native ESM (relative imports
carry `.js`). `web` uses `@/*` alias. Match the file you are editing.

### Authoritative rename inventory

Every identifier occurrence of `district`/`city` to rename is listed below
(produced from `grep -rn` at commit `12d1c0e`). **Rename the property /
parameter / field identifiers only.** Leave string-literal values, the
`player-matching` canonical alias strings, and any `capacity` match alone.

**WEB — `web/`**
- `lib/shared/types.ts` — `:32`, `:76`, `:78`, `:105`, `:245`, `:382`, `:383` (+ the two doc comments above)
- `lib/shared/helpers.ts` — `:629`, `:723`, `:764`, `:1014`, `:1015`
- `features/venue/setup-wizard.tsx` — `:35`, `:36`, `:56`, `:57`, `:80`, `:81`, `:229`, `:231`, `:232`, `:234`, `:238`, `:240`, `:241`, `:243`, `:459` (VenueDraft field, inputs, validation, review line; `id="v-district"`→`id="v-ward"`, `id="v-city"`→`id="v-province"`)
- `features/venue/venue-actions.ts` — `:29`, `:30` (`VenueInput`)
- `features/admin/approvals.tsx` — `:59`, `:60`, `:68`, `:69` (table head keys + `venue.district`/`venue.city`)
- `features/admin/venues.tsx` — `:80`, `:100`
- `features/booking/book.tsx` — `:317`, `:560`, `:617`, `:1068` (`court.district`; the `:1024` comment is prose — optional)
- `features/chat/ai-native-dashboard.tsx` — `:96`, `:118`, `:126`, `:504`, `:506`, `:1145`, `:1301`, `:1439` (`district`, `districtMatched`, `booking.district`, `court.district`, `room.district`)
- `features/dashboard/app-sidebar.tsx` — `:184` (`VENUE.district`)
- `features/dashboard/shared.tsx` — `:282` (`court.district`)
- `features/play/active-room.tsx` — `:274` (`room.district`)
- `features/play/find-courts.tsx` — `:285` (`court.district`)
- `features/play/match-maker.tsx` — `:160` (`room.district`)
- `features/play/match-maker-dialogs.tsx` — `:119`, `:210`, `:387`, `:579` (`c.district`, `court.district`; the `:113` comment is prose — optional)
- `features/play/player-matching.ts` — `:408` (`court.district`). **Do NOT** touch `:173`/`:178`/`:179` — those are `canonical`/`aliases` **string values** (`"District 7"`, `"quan 7"`), data not identifiers.
- `features/play/session.tsx` — `:180`, `:1224`, `:1241`, `:1256`, `:1292`, `:1484`, `:1813`, `:1851`, `:1936`, `:1977` (all `district` identifiers: type fields, projections, `court.district`, `room.district`)

**API — `api/src/`**
- `shared/types.ts` — `:32`, `:76`, `:78`, `:105`, `:245`, `:382`, `:383` (mirror of web; keep identical)
- `shared/helpers.ts` — `:629`, `:723`, `:764`, `:1014`, `:1015` (mirror of web)
- `features/venues/venues.dto.ts` — `:74`, `:78` (`VenueInputDto.district` / `.city`)
- `features/venues/venues.service.ts` — `:69`, `:70` (`VenueInput` interface), `:300`, `:301`, `:506`, `:507`, `:552`, `:553`
- `features/courts/court.schema.ts` — `:15`, `:16` (`@Prop` columns), `:39`, `:40` (projection)
- `features/ai/ai.service.ts` — `:263`, `:296`, `:307-313`, `:346-347`, `:413`, `:417`(desc field-name only), `:420`, `:430`, `:432`, `:441`, `:515` (tool param `district`→`ward`, `districtMatched`→`wardMatched`, filter, return). Prose examples `"Quận 3"` in strings at `:149`, `:159`, `:172`, `:258`, `:267`, `:417` are data — leave the place-name values; only change the literal word `district`/`districtMatched` where it names the field/param.
- `features/ai/player-matching.ts` — `:401` (`court.district`). **Do NOT** touch `:166`/`:171`/`:172` (canonical alias **values**).
- `data/venue.ts` — `:28`, `:29`, `:633`, `:634`, `:680`, `:681` (the **keys** `district:`/`city:` → `ward:`/`province:`; keep the string **values** `"Quận Cầu Giấy"`, `"Hà Nội"` etc. — value refresh is plan 017)
- `data/player.ts` — every `district:`/`city:` **key** (lines `:23`, `:113-114`, `:129-130`, `:145-146`, `:161-162`, `:177-178`, `:193-194`, `:209-210`, `:225-226`, `:241-242`, `:257-258`, `:273-274`, `:296`, `:314`, `:332`, `:350`, `:368`, `:386`) → `ward:`/`province:`; keep the string values.

**i18n message catalogs** — `web/messages/en.json` and `web/messages/vi.json`:
rename the message **keys** `district` → `ward` and `city` → `province`
wherever they appear as location labels (`VenueSetup.form.*`, `VenueManage.form.*`,
`AdminVenues.table.*`, and the admin approvals table block), and update the code
sites above (`t("form.district")` → `t("form.ward")`, `t("table.district")` →
`t("table.ward")`, etc.) to match. The **values** (Vietnamese/English label text)
should be updated to the new terms: `"Phường / Xã"` for ward, `"Tỉnh / Thành phố"`
for province, in both locales. Keep the two catalogs key-for-key identical
(the repo enforces i18n parity).

## Commands you will need

| Purpose         | Command                                        | Expected on success |
|-----------------|------------------------------------------------|---------------------|
| Web typecheck   | `cd web && pnpm typecheck`                      | exit 0, no errors   |
| Web lint        | `cd web && pnpm lint`                           | exit 0              |
| Web build       | `cd web && pnpm build`                          | exit 0              |
| Web tests       | `cd web && pnpm test`                           | all pass            |
| API typecheck   | `cd api && pnpm typecheck`                      | exit 0, no errors   |
| API lint        | `cd api && pnpm lint`                           | exit 0              |
| API tests       | `cd api && pnpm test`                           | all pass            |

Run each app's commands from inside that app's directory (two standalone
projects; no root scripts).

## Scope

**In scope** — exactly the files in the "Authoritative rename inventory" above:
`web/lib/shared/{types.ts,helpers.ts}`, `web/features/**` (the listed files),
`web/messages/{en,vi}.json`, `api/src/shared/{types.ts,helpers.ts}`,
`api/src/features/{venues,courts,ai}/**` (the listed files), and
`api/src/data/{venue.ts,player.ts}`.

**Out of scope** (do NOT touch):
- Any `capacity` identifier (false-positive on the `city` grep).
- The `player-matching` canonical/alias **string values** (`"District 7"`,
  `"quan 7"`, `"District 3"`, `"District 1"`) in both apps — data, not fields.
- The place-name **string values** in `data/venue.ts` and `data/player.ts`
  (`"Quận 1"`, `"Hà Nội"`, …) — refreshing these to real new-units is plan 017.
- Any **behavior** change: no new filters, no reordering, no dropdowns. That is
  plans 017/018.
- The Mongoose `venue.schema.ts` / `brand.schema.ts` `info` Mixed blobs — no
  schema field renames there (the location lives inside the typed `info` object,
  already covered by the shared-type rename).

## Git workflow

- Branch: `advisor/016-rename-ward-province`
- Commit per logical unit is fine (e.g. "shared types", "web consumers",
  "api consumers", "i18n"); message style matches the repo — short lowercase
  scope prefix, e.g. `refactor: rename district/city to ward/province`.
  End the commit body with:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Order matters: rename the type definitions first (both apps), then the
consumers, so the compiler pinpoints every remaining site for you.

### Step 1: Rename the shared type definitions (both apps, kept identical)

In **both** `web/lib/shared/types.ts` and `api/src/shared/types.ts`, rename the
identifiers at the lines listed in the inventory: `city → province` on `User`
and `Venue`; `district → ward` and `city → province` on `Court` and `Venue`;
`district → ward` on `MatchRoom` and the reservation/session interface at
`:245`. Update the two `Court` doc comments to the new terms, e.g.:
```ts
/** Cấp phường/xã — full Vietnamese name e.g. "Phường Bến Nghé", "Xã Tân Thông Hội" */
ward: string
/** Tỉnh/thành phố trực thuộc trung ương — e.g. "TP. Hồ Chí Minh", "Hà Nội" */
province: string
```

**Verify**: `cd web && pnpm typecheck` → **fails** with errors at the consumer
sites (expected — you have not renamed them yet). This confirms the compiler is
now your checklist. Same for `cd api && pnpm typecheck`.

### Step 2: Rename every web consumer

Work through the WEB section of the inventory (helpers, setup-wizard, admin,
booking, chat, dashboard, play/*, session). Rename `.district`→`.ward` and
`.city`→`.province` property accesses and object keys. In `setup-wizard.tsx`
also rename the input `id`s (`v-district`→`v-ward`, `v-city`→`v-province`) and
the `t("form.district")`/`t("form.city")` calls to `t("form.ward")`/
`t("form.province")`. In the admin tables rename `t("table.district")`/
`t("table.city")` to `.ward`/`.province`.

**Verify**: `cd web && pnpm typecheck` → **exit 0, no errors** (all consumer
sites renamed). If errors remain, they name the exact file:line still using the
old identifier — fix and re-run.

### Step 3: Rename the i18n keys and values (both locales)

In `web/messages/en.json` and `web/messages/vi.json`, rename the location label
keys `district`→`ward`, `city`→`province` in every block that has them
(`VenueSetup.form`, `VenueManage.form`, `AdminVenues.table`, the admin approvals
table block), and set the values to the new terms:
- vi: ward → `"Phường / Xã"`, province → `"Tỉnh / Thành phố"`
- en: ward → `"Ward / Commune"`, province → `"Province / City"`
Keep the two catalogs key-for-key identical.

**Verify**:
`node -e "const a=Object.keys(require('./web/messages/en.json')),b=Object.keys(require('./web/messages/vi.json'));const d=require('assert');d.deepStrictEqual(new Set(a),new Set(b));console.log('top-level keys parity OK')"`
→ prints `top-level keys parity OK` (top-level parity smoke check; if the repo
has a deeper i18n parity test, run that instead — see `web` tests).

### Step 4: Rename every api consumer

Work through the API section of the inventory: `shared/helpers.ts` (mirror web),
`venues.dto.ts`, `venues.service.ts`, `courts/court.schema.ts` (both the
`@Prop` columns and the projection), `ai/ai.service.ts` (tool param
`district`→`ward`, `districtMatched`→`wardMatched`, filter and returns),
`ai/player-matching.ts:401`, and the seed **keys** in `data/venue.ts` and
`data/player.ts`.

**Verify**: `cd api && pnpm typecheck` → **exit 0, no errors**.

### Step 5: Full verification — both apps green

**Verify** (all must pass):
- `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- `cd api && pnpm typecheck && pnpm lint && pnpm test`

## Test plan

No new tests — this is a behavior-preserving rename; the existing suites in both
apps plus `pnpm typecheck` are the regression net (the compiler proves every
reference was renamed consistently). If any existing test hardcodes the old
field name in an object literal or assertion, rename it there too (it is a
consumer and in scope).

- Verification: `cd web && pnpm test` and `cd api && pnpm test` → all pass with
  the **same** number of tests as before this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd web && pnpm typecheck` exits 0
- [ ] `cd web && pnpm lint` exits 0
- [ ] `cd web && pnpm build` exits 0
- [ ] `cd web && pnpm test` — all pass (count unchanged)
- [ ] `cd api && pnpm typecheck` exits 0
- [ ] `cd api && pnpm lint` exits 0
- [ ] `cd api && pnpm test` — all pass (count unchanged)
- [ ] No `district:` / `city:` **property declaration** remains in the type,
      DTO, or schema files:
      `grep -nE '(^|[^a-zA-Z])(district|city)\s*:' web/lib/shared/types.ts api/src/shared/types.ts api/src/features/venues/venues.dto.ts api/src/features/courts/court.schema.ts`
      → **no output** (all renamed to `ward`/`province`; a hit means a missed field).
- [ ] The AI tool parameter is renamed:
      `grep -n 'district' api/src/features/ai/ai.service.ts | grep -viE '"Quận|Bình Thạnh|District [0-9]|neighborhood'`
      → **no output** for the field/param identifier `district` (only the
      example place-name **string values** may remain).
- [ ] The `player-matching` canonical alias values are **untouched** in both
      apps: `grep -c 'District 7' web/features/play/player-matching.ts api/src/features/ai/player-matching.ts`
      → each file still returns `1`.
- [ ] No files outside the in-scope inventory are modified (`git status`).
- [ ] `plans/README.md` status row for 016 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows an in-scope file changed since `12d1c0e` and its live
  code no longer matches the "Current state" excerpts.
- `pnpm typecheck` still reports old-identifier errors after you believe every
  inventory site is renamed **and** the errors point somewhere NOT in the
  inventory — that means a usage the grep missed; report the file:line rather
  than guess whether it is a location field or an unrelated `city`.
- Renaming the AI tool parameter breaks an `ai` test whose fixture asserts on
  the old param/return name in a way that implies a behavior contract you are
  unsure about — report it.
- You find a `district`/`city` identifier that is genuinely NOT a location field
  (e.g. an unrelated domain concept) — report it instead of renaming.

## Maintenance notes

- After this lands, plans **017** and **018** assume the venue/branch address
  fields are named `province` and `ward`. Do those next.
- **Semantic caveat for reviewers**: the AI matchmaking search still operates at
  what was "district" granularity — renaming the tool param to `ward` changes
  only the identifier, not the search behavior or the demo data (still
  district-level place names until plan 017 refreshes the seed). If the product
  later wants true ward-level or province-level search, that is a separate
  behavior change, not this rename.
- The `web` and `api` shared copies (`lib/shared` vs `src/shared`) are
  hand-duplicated — a reviewer should confirm `types.ts` and `helpers.ts` stayed
  byte-identical (modulo `.js` import extensions) across the two apps.
- `court.schema.ts` are **real DB columns**: existing court documents in
  MongoDB will still have `district`/`city` keys. This prototype re-seeds
  courts on empty and the fields live in a required column, so a fresh DB is
  clean; if the operator has a populated non-throwaway DB, a one-off Mongo
  `$rename` migration (`district`→`ward`, `city`→`province` on the courts
  collection) is the follow-up — flag it in the PR.
