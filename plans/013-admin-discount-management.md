# Plan 013: Admin can manage discount codes (coupons) — list, create, edit, activate/deactivate, delete

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 44b8921..HEAD -- api/src/features/discounts api/src/features/admin web/features/admin web/lib/api.ts web/messages`
> The in-flight work this plan was drafted against landed as commit
> `44b8921` — the excerpts below match that commit. If any in-scope file
> changed since, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (new admin-only surface; the checkout/validate path is not modified)
- **Depends on**: none (plans 001–012 are DONE)
- **Category**: direction (feature)
- **Planned at**: commit `44b8921`, 2026-07-24

## Why this matters

Discount codes exist end-to-end in the product — players apply them at
checkout (`POST /api/discounts/validate`, re-validated server-side by
`PaymentsService#checkout`, usage counted on settlement) — but the set of
codes is frozen: it comes from a hardcoded seed (`api/src/data/discounts.ts`)
inserted on first read, and there is no way to add, retire, or tune a code
without editing source and wiping the collection. The admin workspace
(`/dashboard/admin`, `/api/admin/*`) already manages venues, bookings, and
refunds cross-tenant; coupons are the obvious missing panel. After this plan,
an admin can list every code with its usage, create new codes, edit their
rules, deactivate/reactivate them, and delete never-used ones — from the
admin UI, in Vietnamese-first copy, without touching the player checkout
behavior at all.

## Current state

### api (NestJS 11, native ESM — relative imports need `.js` extensions)

- `api/src/features/discounts/discount-code.schema.ts` — the `DiscountCode`
  Mongoose class. Fields: `code` (String, `unique: true, uppercase: true,
  trim: true`), `type` (`"percent" | "fixed"`), `value`, optional
  `maxDiscount` (VND cap, only meaningful for percent), optional `minOrder`,
  optional `validFrom`/`validUntil` (Date), optional `usageLimit` (global cap)
  and `perUserLimit`, `usedCount` (default 0), `active` (default true),
  `description` (Vietnamese user-facing label). `@Schema({ timestamps:
  true })`. Every `@Prop` carries an explicit `type:` because tsx/esbuild
  emits no design:type metadata — **keep that convention for any prop you
  add** (you should not need to add any).
- `api/src/features/discounts/discounts.service.ts` — `DiscountsService`,
  currently two public methods: `validate(rawCode, amount)` (used by the
  player endpoint and by `PaymentsService#checkout`) and
  `applyUsage(code)` (atomic limit-gated `usedCount` increment on payment
  settlement). Plus a private seeder:

  ```ts
  // discounts.service.ts:41-51
  private readonly ensureSeeded = once(async () => {
    if ((await this.discountModel.countDocuments()) > 0) return
    try {
      await this.discountModel.insertMany(
        INITIAL_DISCOUNTS.map((d) => ({ ...d, usedCount: 0, active: true })),
        { ordered: false }
      )
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
    }
  })
  ```

  `once` and `isDuplicateKeyError` come from `../../common/mongo-util.js`.
  `validate` starts with `await this.ensureSeeded()` — your new admin reads
  and creates must do the same so the seed codes appear even if an admin is
  the first caller after a wipe.
- `api/src/features/discounts/discount.helpers.ts` — pure helpers
  (`computeDiscount`, `assertDiscountApplicable`) with Vietnamese error
  messages. Unit-tested without a DB in `api/test/discount-helpers.test.ts`.
  Do not modify.
- `api/src/features/discounts/discounts.module.ts` — registers the schema,
  **exports `DiscountsService`** (PaymentsModule already imports it).
- `api/src/features/discounts/discounts.dto.ts` — `ValidateDiscountDto`; note
  its code normalization, which the new create DTO must copy:

  ```ts
  // discounts.dto.ts:7-12
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value
  )
  @IsString()
  @IsNotEmpty()
  code: string
  ```

- `api/src/features/admin/admin.controller.ts` — `AdminController`, mounted
  at `/api/admin`, class-level `@Roles("admin")` + `@UseGuards(RolesGuard)`.
  All handlers delegate to `AdminService`; param/body DTOs live in
  `admin.dto.ts`. Currently imports `Body, Controller, Get, Param, Post,
  Query, UseGuards` from `@nestjs/common` — you will add `Patch` and
  `Delete`.
- `api/src/features/admin/admin.service.ts` — composes other features'
  unscoped service methods; performs **no authorization itself** (the guard
  at the controller is the only gate — keep that convention). Constructor
  injects services with explicit `@Inject(X)`.
- `api/src/features/admin/admin.module.ts` — imports the feature modules
  whose services `AdminService` composes. You will add `DiscountsModule`.
- `api/src/features/payments/payments.service.ts` — the interaction to
  preserve, not modify: checkout re-validates the code via
  `DiscountsService#validate`, enforces `usageLimit`/`perUserLimit` by
  **counting `Payment` documents whose `discountCode` field equals the code
  string** (`assertRedemptionQuota`), and on settlement calls
  `applyUsage(code)`; an `applyUsage` returning `"missing"` (code deleted
  since checkout) is already handled — it logs a warning and continues
  (lines ~388–403). This is why **`code` is immutable after creation** in
  this plan: payments reference codes by string.
- Error convention: services throw Nest `HttpException`s
  (`NotFoundException`, `BadRequestException`, `ConflictException`) with
  **Vietnamese user-facing messages**; `AllExceptionsFilter` renders
  `{ error: message }`.
- `api/src/data/discounts.ts` — the seed (`GIAM10`, `GIAM20`, `SPORT50K`,
  `HETHAN`). Do not modify.

### web (Next.js 16 App Router, React 19, next-intl, Tailwind v4, shadcn on @base-ui)

- `web/features/admin/nav.ts` — `ADMIN_NAV: NavItem<AdminSectionKey>[]` and
  the `AdminSectionKey` union; sidebar/topbar render from it, labels/captions
  resolve from the `AdminNav` i18n namespace **by `key`** (the `label`/
  `caption` strings in the array are English fallbacks/documentation).
- `web/app/[locale]/dashboard/admin/<section>/page.tsx` — thin async server
  components: `generateMetadata` from the section's i18n namespace,
  `setRequestLocale(locale)`, fetch via a `lib/api.ts` helper, render the
  feature view. Exemplar to copy verbatim in shape:
  `web/app/[locale]/dashboard/admin/approvals/page.tsx` (27 lines).
- `web/app/[locale]/dashboard/admin/layout.tsx` — role guard (redirects
  non-admins). Nothing to change; new pages under it are automatically
  gated.
- `web/lib/api.ts` — server-only fetchers. The admin block (lines ~204–229)
  has one `fetchAdminX` per section calling `apiFetch<T>("/api/admin/...")`.
  Mutations go through `apiAction` (same file), used by
  `web/features/admin/admin-actions.ts` — `"use server"` actions that POST
  and then `revalidatePath("/dashboard/admin", "layout")`.
- `web/features/admin/admin-types.ts` — one exported interface/type per
  admin endpoint payload.
- `web/features/admin/approvals.tsx` — the table-view exemplar: `"use
  client"`, `useTranslations("AdminApprovals")`, local `rows` state seeded
  from the server prop, per-row `pending` id, `toast.error` on failure,
  shadcn `Table`, `VenueEmpty` for the empty state.
- `web/features/venue/schedule.tsx` — the **form-in-dialog exemplar**:
  `WalkInDialog` (line ~900) and `BlockDialog` (line ~1074) show the repo's
  pattern for a shadcn `Dialog` containing `Input`/`Select` fields with
  local state, submit handler calling a server action, pending flag, and
  toast on error. Model the create/edit coupon dialog on these.
  ⚠ Repo eslint **errors on synchronous `setState` inside effects** — do not
  initialize dialog form state in a `useEffect`; do what the exemplars do
  (initialize state from props/`key`, or set it in the open-button click
  handler).
- i18n: `web/messages/en.json` + `web/messages/vi.json`, namespaces
  `AdminNav`, `AdminOverview`, …, `AdminApprovals`. **Vietnamese is the
  primary locale** — every new string goes into both files.
- `formatVnd` is imported from `@/lib/shared` (see
  `web/features/admin/bookings.tsx:15`).
- Prettier: no semicolons, double quotes, 2-space indent, 80-col. Run
  `pnpm format` inside `web/` and `api/` before committing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| api install | `cd api && pnpm install` | exit 0 |
| api typecheck | `cd api && pnpm typecheck` | exit 0 |
| api lint | `cd api && pnpm lint` | exit 0 |
| api tests | `cd api && pnpm test` | all pass; 291 pass today, +N new |
| api single test file | `cd api && node --import tsx --test test/discounts-service.test.ts` | all pass |
| web install | `cd web && pnpm install` | exit 0 |
| web typecheck | `cd web && pnpm typecheck` | exit 0 |
| web lint | `cd web && pnpm lint` | exit 0 |
| web build | `cd web && pnpm build` | exit 0 |
| web tests | `cd web && pnpm test` | all pass (27 today, unchanged; lint has 3 pre-existing warnings, 0 errors) |
| format | `pnpm format` (inside each app) | exit 0 |

No live DB or Clerk credentials are needed — all api tests mock Mongoose via
DI (`getModelToken`).

## Suggested executor toolkit

- `next-best-practices` skill (if available) when writing the new route
  `page.tsx` — this is Next.js 16; also `web/node_modules/next/dist/docs/`
  per `AGENTS.md`.
- Read `CLAUDE.md` at the repo root before starting.

## Scope

**In scope** (the only files you should modify or create):

api:
- `api/src/features/discounts/discounts.service.ts` (extend)
- `api/src/features/admin/admin.controller.ts` (add routes)
- `api/src/features/admin/admin.service.ts` (add delegating methods)
- `api/src/features/admin/admin.module.ts` (import DiscountsModule)
- `api/src/features/admin/admin.dto.ts` (add DTOs)
- `api/test/discounts-service.test.ts` (extend)

web:
- `web/lib/api.ts` (one fetcher)
- `web/features/admin/admin-types.ts` (one type)
- `web/features/admin/admin-actions.ts` (three actions)
- `web/features/admin/nav.ts` (one nav entry + key)
- `web/features/admin/discounts.tsx` (create — the view)
- `web/app/[locale]/dashboard/admin/discounts/page.tsx` (create)
- `web/messages/en.json`, `web/messages/vi.json` (add `AdminNav.discounts`
  and the `AdminDiscounts` namespace)

**Out of scope** (do NOT touch, even though they look related):
- `api/src/features/discounts/discount.helpers.ts`, `discounts.controller.ts`,
  `discounts.dto.ts`, `discount-code.schema.ts`, `discounts.module.ts` — the
  player-facing validate path and the schema are unchanged.
- `api/src/features/payments/**` — checkout/quota/settlement logic is
  unchanged.
- `api/src/data/discounts.ts` — the seed stays as is.
- `web/features/booking/**` — the player checkout UI is unchanged.
- Renaming a code, editing `usedCount`, or any per-code redemption report —
  deferred (see Maintenance notes).

## Git workflow

- Branch off master: `advisor/013-admin-discount-management` (matches
  `advisor/NNN-slug` convention of plans 001–012).
- Commit per logical unit (api service+routes, api tests, web). Message
  style from `git log`: lowercase scope prefix, e.g.
  `api: admin CRUD for discount codes` / `web: admin coupons panel`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Admin methods on `DiscountsService`

In `api/src/features/discounts/discounts.service.ts`:

1. Export a row type the admin surface returns (plain object, not a Mongoose
   doc):

   ```ts
   /** One code as the admin panel sees it — `GET /api/admin/discounts`. */
   export interface AdminDiscountRow {
     code: string
     type: DiscountCode["type"]
     value: number
     maxDiscount?: number
     minOrder?: number
     validFrom?: Date
     validUntil?: Date
     usageLimit?: number
     perUserLimit?: number
     usedCount: number
     active: boolean
     description: string
     createdAt?: Date
   }
   ```

   (Dates serialize to ISO strings over JSON automatically. `createdAt`
   exists via `timestamps: true` but isn't on the schema class — read it off
   the doc with a cast, or add it to the mapper via
   `(doc as { createdAt?: Date }).createdAt`.)

2. Add a module-private invariant checker used by both create and update —
   service-level (not DTO-level) because a PATCH can flip `type` and the
   rules are cross-field on the *resulting* document:

   ```ts
   function assertDiscountShape(d: {
     type: DiscountCode["type"]
     value: number
     maxDiscount?: number
     validFrom?: Date
     validUntil?: Date
   }): void {
     if (d.type === "percent" && (d.value < 1 || d.value > 100)) {
       throw new BadRequestException("Giá trị phần trăm phải từ 1 đến 100")
     }
     if (d.type === "fixed" && d.maxDiscount !== undefined) {
       throw new BadRequestException(
         "Giảm tối đa chỉ áp dụng cho mã phần trăm"
       )
     }
     if (d.validFrom && d.validUntil && d.validFrom >= d.validUntil) {
       throw new BadRequestException(
         "Thời gian bắt đầu phải trước thời gian kết thúc"
       )
     }
   }
   ```

3. Add four public methods (each starting with `await this.ensureSeeded()`
   except `deleteCode`/`updateCode`, where a missing collection just means
   404 — simplest is to call it in all four for uniformity):

   - `listAllAdmin(): Promise<AdminDiscountRow[]>` — `find()` sorted
     ascending by `createdAt` (`.sort({ createdAt: 1 })`), map to rows.
   - `createCode(input): Promise<AdminDiscountRow>` — input is the DTO shape
     with `validFrom`/`validUntil` already `Date | undefined` (controller
     converts, see Step 2). Run `assertDiscountShape`, then
     `this.discountModel.create({ ...input, usedCount: 0 })` inside
     try/catch; on `isDuplicateKeyError(err)` throw
     `new ConflictException("Mã giảm giá đã tồn tại")`, else rethrow. The
     schema's `uppercase/trim` plus the DTO transform both normalize the
     code. `active` defaults true via the schema when omitted.
   - `updateCode(rawCode, patch): Promise<AdminDiscountRow>` — normalize
     `rawCode` (`trim().toUpperCase()`), `findOne({ code })`, missing →
     `new NotFoundException("Mã giảm giá không tồn tại")`. Apply only the
     keys present in the patch (`undefined` means "leave unchanged";
     explicitly setting `maxDiscount`/`minOrder`/limits/dates to `null` to
     clear them is NOT supported in this plan — omit means keep). Then run
     `assertDiscountShape` on the resulting doc's
     `{ type, value, maxDiscount, validFrom, validUntil }`, `await
     doc.save()`, return the mapped row. `code` and `usedCount` are never
     patchable.
   - `deleteCode(rawCode): Promise<void>` — normalize, `findOne`, missing →
     the same `NotFoundException`; if `doc.usedCount > 0` throw
     `new ConflictException(
       "Mã đã có lượt sử dụng — hãy tắt mã thay vì xoá"
     )`; else `await this.discountModel.deleteOne({ code })`. (A code
     referenced by an in-flight `awaiting` payment is tolerable: settlement
     calls `applyUsage`, which returns `"missing"`, and
     `PaymentsService` already logs-and-continues on that — see Current
     state.)

   Add `BadRequestException, ConflictException` to the existing
   `@nestjs/common` import.

**Verify**: `cd api && pnpm typecheck` → exit 0.

### Step 2: DTOs, controller routes, admin wiring

1. `api/src/features/admin/admin.dto.ts` — add (imports from
   `class-validator` are already partially there; add what's missing, plus
   `Transform` from `class-transformer`):

   ```ts
   const normalizeCode = ({ value }: { value: unknown }) =>
     typeof value === "string" ? value.trim().toUpperCase() : value

   export class DiscountCodeParamDto {
     @Transform(normalizeCode)
     @IsString()
     @IsNotEmpty()
     code: string
   }

   export class CreateDiscountDto {
     @Transform(normalizeCode)
     @IsString()
     @IsNotEmpty()
     @MaxLength(32)
     @Matches(/^[A-Z0-9]+$/, {
       message: "Mã chỉ gồm chữ không dấu và số",
     })
     code: string

     @IsIn(["percent", "fixed"])
     type: "percent" | "fixed"

     @IsInt()
     @Min(1)
     value: number

     @IsOptional() @IsInt() @Min(1) maxDiscount?: number
     @IsOptional() @IsInt() @Min(1) minOrder?: number
     @IsOptional() @IsISO8601() validFrom?: string
     @IsOptional() @IsISO8601() validUntil?: string
     @IsOptional() @IsInt() @Min(1) usageLimit?: number
     @IsOptional() @IsInt() @Min(1) perUserLimit?: number
     @IsOptional() @IsBoolean() active?: boolean

     @IsString()
     @IsNotEmpty()
     @MaxLength(200)
     description: string
   }

   export class UpdateDiscountDto {
     @IsOptional() @IsIn(["percent", "fixed"]) type?: "percent" | "fixed"
     @IsOptional() @IsInt() @Min(1) value?: number
     @IsOptional() @IsInt() @Min(1) maxDiscount?: number
     @IsOptional() @IsInt() @Min(1) minOrder?: number
     @IsOptional() @IsISO8601() validFrom?: string
     @IsOptional() @IsISO8601() validUntil?: string
     @IsOptional() @IsInt() @Min(1) usageLimit?: number
     @IsOptional() @IsInt() @Min(1) perUserLimit?: number
     @IsOptional() @IsBoolean() active?: boolean
     @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
     description?: string
   }
   ```

   (Note `UpdateDiscountDto` has no `code` field — with the global
   `ValidationPipe`'s `whitelist: true`, a `code` in a PATCH body is
   silently stripped, which is the intended "immutable" behavior.)

2. `api/src/features/admin/admin.service.ts` — inject
   `DiscountsService` (`@Inject(DiscountsService) private readonly
   discounts: DiscountsService`, import from
   `../discounts/discounts.service.js`) and add thin delegators that also
   convert the DTO's ISO date strings to `Date`:

   ```ts
   listDiscounts() { return this.discounts.listAllAdmin() }

   createDiscount(dto: CreateDiscountDto) {
     return this.discounts.createCode({
       ...dto,
       validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
       validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
     })
   }

   updateDiscount(code: string, dto: UpdateDiscountDto) {
     return this.discounts.updateCode(code, {
       ...dto,
       validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
       validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
     })
   }

   deleteDiscount(code: string) { return this.discounts.deleteCode(code) }
   ```

3. `api/src/features/admin/admin.controller.ts` — add `Patch, Delete` to
   the `@nestjs/common` import and four handlers following the existing
   style:

   ```ts
   @Get("discounts")
   discounts() {
     return this.admin.listDiscounts()
   }

   @Post("discounts")
   createDiscount(@Body() body: CreateDiscountDto) {
     return this.admin.createDiscount(body)
   }

   @Patch("discounts/:code")
   updateDiscount(
     @Param() param: DiscountCodeParamDto,
     @Body() body: UpdateDiscountDto
   ) {
     return this.admin.updateDiscount(param.code, body)
   }

   @Delete("discounts/:code")
   async deleteDiscount(@Param() param: DiscountCodeParamDto) {
     await this.admin.deleteDiscount(param.code)
     return { ok: true }
   }
   ```

4. `api/src/features/admin/admin.module.ts` — add `DiscountsModule` (import
   from `../discounts/discounts.module.js`) to the `imports` array.

**Verify**: `cd api && pnpm typecheck && pnpm lint` → both exit 0.

### Step 3: api tests

Extend `api/test/discounts-service.test.ts` (its existing
`makeFakeDiscountModel`/`makeService` cover only `updateOne`/`exists` — add a
second fake-model factory for the admin methods, or extend the existing one
with scriptable `countDocuments`, `find`, `findOne`, `create`, `deleteOne`).
Follow the file's existing DI style (`Test.createTestingModule` +
`getModelToken(DiscountCode.name)`). See "Test plan" for the case list.

**Verify**: `cd api && pnpm test` → all pass (285 existing + your new
count), zero failures.

### Step 4: web fetcher, types, actions, nav

1. `web/features/admin/admin-types.ts` — add (dates arrive as ISO strings
   over JSON):

   ```ts
   /** `GET /api/admin/discounts` — one coupon row of the admin panel. */
   export interface AdminDiscountRow {
     code: string
     type: "percent" | "fixed"
     value: number
     maxDiscount?: number
     minOrder?: number
     validFrom?: string
     validUntil?: string
     usageLimit?: number
     perUserLimit?: number
     usedCount: number
     active: boolean
     description: string
     createdAt?: string
   }
   ```

2. `web/lib/api.ts` — in the admin block, add
   `fetchAdminDiscounts(): Promise<AdminDiscountRow[]>` calling
   `apiFetch<AdminDiscountRow[]>("/api/admin/discounts")`; import the type
   with the other admin types.

3. `web/features/admin/admin-actions.ts` — add three actions matching the
   file's existing pattern (call `apiAction`, then `revalidateAdmin()`).
   Input types: define a `DiscountInput` type (all the create fields,
   optional dates as ISO strings) locally or import shapes from
   `admin-types`:

   ```ts
   export async function createDiscount(
     input: AdminDiscountInput
   ): Promise<AdminDiscountRow> { ... POST /api/admin/discounts ... }

   export async function updateDiscount(
     code: string,
     patch: Partial<AdminDiscountInput>
   ): Promise<AdminDiscountRow> { ... PATCH /api/admin/discounts/${code} ... }

   export async function deleteDiscount(code: string): Promise<void> {
     ... DELETE /api/admin/discounts/${code} ...
   }
   ```

   (Check `apiAction`'s signature in `lib/api.ts` for how method/body are
   passed — mirror `rejectVenue`, which sends a JSON body and returns the
   parsed response. For DELETE, pass `{ method: "DELETE" }`.)

4. `web/features/admin/nav.ts` — add `"discounts"` to `AdminSectionKey` and
   an entry after `bookings` (import `TicketPercent` from `lucide-react`):

   ```ts
   {
     key: "discounts",
     href: `${ADMIN_BASE_PREFIX}/discounts`,
     label: "Coupons",
     icon: TicketPercent,
     caption: "Discount codes and usage",
   },
   ```

**Verify**: `cd web && pnpm typecheck` → exit 0.

### Step 5: the view + route + i18n

1. `web/features/admin/discounts.tsx` (create) — `"use client"` view
   `AdminDiscountsView({ discounts }: { discounts: AdminDiscountRow[] })`,
   modeled on `approvals.tsx` for the page/table skeleton and on
   `schedule.tsx`'s `WalkInDialog`/`BlockDialog` for the create/edit dialog.
   Structure:

   - Header row: title + subtitle from `useTranslations("AdminDiscounts")`,
     and a "create" `Button` on the right that opens the dialog in create
     mode.
   - Table columns: code (mono/medium), description, value (render
     `value + "%"` for percent — with `maxDiscount` as a muted
     `formatVnd` suffix when set — and `formatVnd(value)` for fixed),
     conditions (minOrder via `formatVnd`, else "—"), validity window
     (format the ISO strings with `toLocaleDateString("vi-VN")`; "—" when
     unbounded), usage (`usedCount`/`usageLimit ?? "∞"`, plus per-user limit
     when set), status (a small badge: active → default/emerald, inactive →
     muted "Đã tắt"), actions.
   - Row actions: **Edit** (opens the dialog pre-filled in edit mode),
     **Toggle active** (`updateDiscount(code, { active: !row.active })`),
     **Delete** — only rendered when `row.usedCount === 0` — behind a
     confirm `Dialog` (copy the confirm-dialog shape from
     `web/features/venue/manage.tsx:130-153`).
   - One dialog component for create+edit: fields code (Input, disabled in
     edit mode — immutable), type (Select percent/fixed), value (number
     Input), maxDiscount (number Input, only shown when type is percent),
     minOrder, usageLimit, perUserLimit (number Inputs, empty = unlimited),
     validFrom/validUntil (`<Input type="datetime-local">`, empty =
     unbounded; on submit convert non-empty values with
     `new Date(value).toISOString()`), description (Input). Submit calls
     `createDiscount`/`updateDiscount`, updates local `rows` state with the
     returned row (append on create, replace by `code` on edit), closes the
     dialog; failures → `toast.error(err.message)` like `approvals.tsx:37`.
     Initialize form state when the dialog opens (via the open handler or a
     `key` on the dialog content) — **never** via a synchronous `setState`
     in an effect (repo eslint errors on it).
   - Empty state: `VenueEmpty` with `t("empty")` like `approvals.tsx:53`.

2. `web/app/[locale]/dashboard/admin/discounts/page.tsx` (create) — copy
   `approvals/page.tsx` verbatim in shape: namespace `AdminDiscounts`,
   fetch `fetchAdminDiscounts()`, render `<AdminDiscountsView
   discounts={rows} />`.

3. i18n — add to **both** `web/messages/vi.json` and `en.json`:

   - `AdminNav.discounts`: vi
     `{ "label": "Mã giảm giá", "caption": "Quản lý coupon và lượt dùng" }`;
     en `{ "label": "Coupons", "caption": "Discount codes and usage" }`.
   - A new `AdminDiscounts` namespace next to the other `Admin*` namespaces
     containing every string the view uses. Vietnamese is primary — write vi
     first, then natural English equivalents. Required keys (extend as the
     view needs, but keep both files' key sets identical): `metaTitle`,
     `metaDescription`, `title` ("Mã giảm giá"), `subtitle` ("Tạo và quản lý
     coupon áp dụng khi thanh toán đặt sân"), `create` ("Tạo mã"), `empty`
     ("Chưa có mã giảm giá nào"), `table.*` (code/description/value/
     conditions/validity/usage/status/actions), `status.active` ("Đang hoạt
     động") / `status.inactive` ("Đã tắt"), `actions.edit` ("Sửa"),
     `actions.enable` ("Bật") / `actions.disable` ("Tắt"), `actions.delete`
     ("Xoá"), `dialog.*` (createTitle/editTitle/field labels/cancel/submit),
     `delete.*` (title/description/cancel/confirm), `unlimited` ("Không giới
     hạn").

**Verify**:
- `cd web && pnpm typecheck && pnpm lint` → exit 0.
- `cd web && pnpm build` → exit 0 (this catches missing i18n keys used by
  `generateMetadata` and broken imports).

### Step 6: format, full gates, index

- Run `pnpm format` in `api/` and in `web/`.
- Re-run all gates (see Done criteria).
- Update the 013 row in `plans/README.md`.

## Test plan

Extend `api/test/discounts-service.test.ts` (pattern: the file's existing
fake-model + `Test.createTestingModule` DI). Cases, each a separate
`void test(...)`:

1. **listAllAdmin seeds an empty collection** — script `countDocuments` → 0;
   assert `insertMany` was called once and `find` was called (returns `[]`
   or scripted docs is fine).
2. **createCode rejects percent value over 100** — expect
   `BadRequestException`, and assert `create` was NOT called.
3. **createCode rejects maxDiscount on a fixed code** — expect
   `BadRequestException`.
4. **createCode maps a duplicate-key error to ConflictException** — script
   the fake `create` to reject with `{ code: 11000 }`; expect
   `ConflictException`.
5. **updateCode 404s an unknown code and normalizes the input** — script
   `findOne` → null; call with `" giam10 "`; expect `NotFoundException` and
   assert the `findOne` filter used `"GIAM10"`.
6. **updateCode validates the resulting shape when flipping type** —
   existing doc `{ type: "percent", value: 10, maxDiscount: 50000, ... }`,
   patch `{ type: "fixed" }` → `BadRequestException` (maxDiscount now
   invalid), and `save` NOT called.
7. **updateCode never changes `code` or `usedCount`** — patch containing
   arbitrary extra keys is a type error at compile time; instead assert a
   successful patch of `{ description: "x" }` calls `save` and the doc's
   `code`/`usedCount` are untouched.
8. **deleteCode refuses a used code** — doc with `usedCount: 3` →
   `ConflictException`, `deleteOne` NOT called.
9. **deleteCode deletes an unused code** — doc with `usedCount: 0` →
   resolves, `deleteOne` called with the normalized code filter.

The fake docs for update/delete need a `save()` recorder; keep it a plain
object with a `save: () => Promise<void>` that pushes to a calls array,
matching the file's recording style.

Verification: `cd api && pnpm test` → all pass (291 + 9 ≈ 300; exact new
count may differ if you add more — report the number).

No new web tests: the web Vitest baseline (plan 008) covers lib logic, not
feature views, and this view introduces no new lib code. `cd web && pnpm
test` must still pass unchanged.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd api && pnpm typecheck && pnpm lint` → exit 0
- [ ] `cd api && pnpm test` → exit 0, ≥ 300 tests, 0 failures
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build` → exit 0
- [ ] `cd web && pnpm test` → exit 0 (unchanged, 27 tests)
- [ ] `grep -n "discounts" api/src/features/admin/admin.module.ts` → shows
      the `DiscountsModule` import
- [ ] `grep -c "admin/discounts" web/features/admin/admin-actions.ts` → ≥ 3
- [ ] `grep -n '"discounts"' web/features/admin/nav.ts` → one nav entry
- [ ] `python3 -c "import json; a=json.load(open('web/messages/en.json')); b=json.load(open('web/messages/vi.json')); assert 'AdminDiscounts' in a and 'AdminDiscounts' in b; assert set(a['AdminNav'])==set(b['AdminNav'])"`
      → exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check fails: an in-scope file changed since `44b8921` and the
  "Current state" excerpts (notably `discounts.service.ts`'s `ensureSeeded`
  at lines 41–51 and `admin.controller.ts`'s class decorators) don't match
  the code.
- `DiscountsModule` no longer exports `DiscountsService`, or
  `AdminController` no longer exists at
  `api/src/features/admin/admin.controller.ts`.
- Adding `DiscountsModule` to `AdminModule` causes a Nest circular-import
  error at boot/test time (would mean the module graph changed since
  planning).
- The global `ValidationPipe` in `api/src/main.ts` no longer has
  `whitelist: true` (the PATCH `code`-stripping behavior in Step 2 depends
  on it).
- Any step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file (e.g. the
  schema).

## Maintenance notes

- **Code is immutable and `usedCount` is untouchable by design** — payments
  reference codes by string (`Payment.discountCode`) and
  `assertRedemptionQuota` counts those documents. If rename support is ever
  wanted, it needs a migration over payments, not a PATCH field.
- **Lowering `usageLimit` below `usedCount` is allowed** and simply exhausts
  the code (validate throws "Mã đã hết lượt sử dụng"; `applyUsage`'s atomic
  filter returns `over_limit`). This is intended admin behavior, not a bug.
- **Deleting a code recreated later under the same string** would let old
  payments count toward the new code's quotas. Mitigated by restricting
  delete to `usedCount === 0`; a reviewer should confirm the delete button
  is gated in the UI *and* the service.
- Reviewer focus: the create/edit dialog's date handling (datetime-local →
  ISO), that no synchronous `setState`-in-effect crept into the dialog, and
  that every `AdminDiscounts` key exists in both locales.
- Deferred follow-ups: clearing an optional field via PATCH (send-`null`
  semantics), a per-code redemption drill-down (which bookings used it), and
  surfacing coupon stats on the admin Overview page.
