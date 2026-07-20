# TODO — Account-type onboarding (Player / Venue / Both)

Goal: after creating an account, users choose what they are — **Player**, **Venue
owner**, or **both** — and that choice decides which setup flows they see: the
player classification questions (`/assessment`), the venue setup wizard
(`/setup`), or both (assessment → wizard). Player-only accounts keep an **Add
venue** entry in the workspace switcher that opens the wizard later; venue-only
accounts are locked to the venue workspace until they explicitly become a
player (symmetric **Become a player** switcher entry → assessment).

## Design decisions

- **Choice point:** a dedicated post-sign-up `/onboarding` page (standalone
  route like `/setup`), reached via a server-side redirect from the dashboard
  layout when the account has no account type yet. This catches email *and*
  Google SSO signups without touching the sign-up form.
- **Storage:** a nullable `accountType` field (`"player" | "venue" | "both"`)
  on the per-user `Profile` document (api), set once from the onboarding page.
- **Effective account type = stored choice ∪ inferred facts.** A completed
  assessment implies the player role; an owned venue implies the venue role
  (`resolveAccountType`). Consequences, all for free with no extra writes:
  - existing accounts (assessment and/or venue already present) never see
    onboarding;
  - a player-only account that provisions a venue becomes "both";
  - a venue-only account that completes the assessment becomes "both".
- **Venue-only lock:** while effective type is `"venue"`, player-workspace
  routes client-redirect to `/dashboard/venue` (which resolves to the venue or
  `/setup`). The assessment gate is skipped for venue-only accounts.
- **"Both" ordering:** assessment first, then the venue wizard — the assessment
  completion screen routes to `/setup` when the account wants a venue but has
  none yet, else to `/dashboard`.

## api

- [ ] `src/shared/types.ts`: add `AccountType` (+ `ACCOUNT_TYPES` const) and
      `Seed.accountType: AccountType | null`.
- [ ] `features/players/profile.schema.ts`: `accountType` prop (String,
      default null) + `ProfileData.accountType` + `toProfileData` (`?? null`
      for pre-existing docs).
- [ ] `features/players/profile.service.ts`: include `accountType` in
      `seedData()`; add `setAccountType(userId, type)`.
- [ ] New `features/account/` feature:
  - `account.service.ts` — pure `resolveAccountType(stored, hasAssessment,
    hasVenue)` + `AccountService` (`getAccountType`, `chooseAccountType`)
    composing ProfileService/AssessmentService/VenuesService.
  - `account.controller.ts` — `GET /api/account` → `{ accountType }`,
    `PUT /api/account` (class-validator DTO).
  - `account.dto.ts` — `@IsIn(ACCOUNT_TYPES)`.
  - `account.module.ts` — imports Players/Assessment/Venues modules; wire into
    `app.module.ts`.
- [ ] `features/seed/seed.service.ts`: compute `accountType` via
      `resolveAccountType` (assessment + myVenueId already in scope) and add it
      to the seed payload.
- [ ] `test/account.test.ts`: unit tests for `resolveAccountType`.

## web

- [ ] `lib/shared/types.ts`: mirror `AccountType` + `Seed.accountType`
      (hand-duplicated shared code — keep in sync with api).
- [ ] `lib/api.ts`: `fetchAccountType()` → `GET /api/account`.
- [ ] New `features/onboarding/`:
  - `account-actions.ts` — server action `chooseAccountType(type)` →
    `PUT /api/account` + `revalidatePath("/dashboard", "layout")`.
  - `onboarding-view.tsx` — client view: two toggleable role cards (Người chơi
    🏸 / Chủ sân 🏟️; both selected = "both"), continue → action → route to
    `/assessment` (player, both) or `/setup` (venue-only).
- [ ] New route `app/[locale]/onboarding/{layout,page}.tsx` (mirrors `/setup`):
      session guard; if effective type already set → redirect to
      `/dashboard/venue` (venue) or `/dashboard`; else render the view.
- [ ] `app/[locale]/dashboard/layout.tsx`: `seed.accountType === null` →
      redirect to `/onboarding`; pass `accountType` to the gate.
- [ ] `features/assessment/player-assessment-gate.tsx`: accept `accountType`;
      venue-only → redirect player-workspace paths to `/dashboard/venue` and
      skip the assessment requirement; unchanged otherwise.
- [ ] Assessment chaining: `/assessment` page also fetches account type + own
      venue, passes `nextPath` (`/setup` when venue wanted but missing) into
      `SkillsAssessmentView`; completion CTA routes there (venue-flavored CTA
      label when heading to setup).
- [ ] `features/dashboard/data-provider.tsx`: expose `accountType` via
      `useData()`.
- [ ] `features/dashboard/app-sidebar.tsx`: venue-only accounts see a dashed
      **Become a player** switcher item (→ `/assessment`) instead of the player
      workspace entry; existing **Add venue** item (no venue yet) unchanged.
- [ ] `messages/{en,vi}.json`: `Onboarding` namespace, `Sidebar.becomePlayer`,
      `Assessment.complete.ctaSetup`.

## Verify

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test`
- [ ] `cd web && pnpm typecheck && pnpm lint`
- [ ] Manual flows: new user → onboarding → each of the three choices; legacy
      user (assessment only) skips onboarding; player-only sees Add venue;
      venue-only locked out of player workspace + Become a player entry.
