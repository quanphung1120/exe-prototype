# Plan 014: Community chat — message the venue after booking, find real users, start DMs and group chats

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a92df40..HEAD -- api/src/features/stream api/src/features/bookings/booking.schema.ts api/src/features/venues/venue.schema.ts api/src/env.validation.ts api/src/shared web/lib/shared web/features/chat web/features/booking web/features/venue/nav.ts web/messages`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> **Also**: `git status --porcelain` — at planning time the operator had
> uncommitted changes to `web/messages/en.json`, `web/messages/vi.json` and
> `web/features/chat/ai-native-dashboard.tsx` (plus other web files). If those
> files are still dirty in the working tree you were dispatched into, STOP —
> the operator must land or stash their in-flight work first.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (extends the already-landed Stream Chat integration)
- **Category**: direction (feature)
- **Planned at**: commit `a92df40`, 2026-07-24

## Why this matters

The product owner wants SportMatch AI to become a community app: after a
booking is paid, the player should be able to message the badminton venue
(e.g. "sân có cho thuê vợt không?"), and any user should be able to find other
real users by name or email, start a 1-1 chat, and create named group chats.
Today the app's chat is real (GetStream Stream Chat) but its social graph is
closed: the only channels are per-user seeded demo chats and match-room team
chats — there is no way to reach the venue operator and no way to find another
real account. This plan adds three capabilities on top of the existing `stream`
feature: **venue chat** (player ↔ venue owner, gated on a paid booking),
**user search** (Clerk-backed, by name or exact email), and **conversations**
(DMs + named group chats).

## Decisions already made (do not re-litigate)

These were resolved by the advisor from the codebase; implement them as stated:

1. **The venue's chat counterpart is the brand owner's real account**
   (`venue.ownerId`, a Clerk userId denormalized from `Brand.ownerId`). No
   synthetic "venue" Stream identity. The channel is *named after the venue*
   and carries a `venueId` custom field so both sides can render it correctly
   and the operator can filter an inbox per venue. Demo seed venues have no
   `ownerId` → venue chat is simply unavailable for them (the api rejects, the
   web toasts).
2. **One persistent channel per (player, venue) pair** — not per booking.
   Channel id is deterministic: `venue-<sha256(venueId + ":" + userId) first 40 hex>`.
   Repeat bookings reuse the same thread.
3. **Eligibility = the caller has a booking at that venue with
   `paymentStatus ∈ {"paid", "refunded", "partial_refund"}`** (refunded users
   may need to discuss their refund). Walk-ins (`paymentStatus: "none"`) and
   unpaid holds don't qualify.
4. **Email search is exact-match only.** If the query contains `@`, look up
   Clerk by exact `emailAddress`; otherwise do a partial `query` search
   (matches names). Emails are returned in the response **only** for
   exact-email queries — a name search must never leak email addresses
   (enumeration/harvesting).
5. **DM channel ids are deterministic** —
   `dm-<sha256(sorted pair joined by ":") first 40 hex>` — so starting a DM
   twice lands in the same channel. **Group ids are random** —
   `group-<crypto.randomUUID() without dashes>` — and a group **requires a
   name** (1–80 chars). Both are `"messaging"`-type channels like everything
   else in this app.
6. **v1 is create-only for groups** — no member add/remove/leave UI for
   ad-hoc groups (rooms already have a server-authoritative membership flow;
   don't duplicate it). Deferred, see Maintenance notes.
7. All new user-facing copy is **Vietnamese-first**: write `vi.json` copy as
   the primary text and provide an English equivalent in `en.json`. Informal
   register ("bạn") in the dashboard, matching existing keys.

## Current state

All paths relative to the repo root, `/home/quan/exe-prototype`. `web` is
Next.js 16 (App Router, React 19); `api` is NestJS 11, **native ESM — every
relative import in `api/src` needs a `.js` extension**. The two apps are
standalone projects (no workspace); `web/lib/shared/` and `api/src/shared/`
are hand-duplicated copies that must be edited in tandem.

### The existing Stream feature (api) — the module you are extending

- `api/src/features/stream/stream.module.ts` — registers the seed-marker
  schema and a `STREAM_CLIENT` factory provider so tests can inject a fake:

  ```ts
  providers: [
    StreamService,
    {
      provide: STREAM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        StreamChat.getInstance(
          config.getOrThrow<string>("STREAM_API_KEY"),
          config.getOrThrow<string>("STREAM_API_SECRET")
        ),
    },
  ],
  exports: [StreamService],
  ```

- `api/src/features/stream/stream.service.ts` — key facts:
  - Lines 19–23 declare the custom channel field(s) — you will extend this:
    ```ts
    declare module "stream-chat" {
      interface CustomChannelData {
        name?: string
      }
    }
    ```
  - Line 26: `export const STREAM_CLIENT = Symbol("STREAM_CLIENT")`.
  - Lines 29–37: channel-id helpers (`demoPlayerStreamId`, `demoChannelId`,
    `roomChannelId = (roomId) => \`room-${roomId}\``) exported as plain
    functions — follow this pattern for the new id helpers.
  - `issueToken` (99–112) signs a 24h token; `seedForUser` (120–186) is the
    one-time demo seeding (leave both untouched).
  - `createRoomChannel` (204–216) is the exemplar for creating a channel:
    ```ts
    await this.client.upsertUsers([{ id: userId }])
    const channel = this.client.channel("messaging", input.id, {
      name: input.name,
      created_by_id: userId,
      members: [userId],
    })
    await channel.create()
    ```
  - Errors are Nest `HttpException`s with Vietnamese messages, e.g. line 233:
    `throw new NotFoundException("Phòng chat không tồn tại")`.
- `api/src/features/stream/stream.controller.ts` — `@Controller("stream")`;
  global `/api` prefix + `ClerkAuthGuard` apply automatically; handlers take
  `@UserId() userId: string` + a class-validator DTO. Routes today: `POST
  token`, `POST rooms`, `POST/DELETE rooms/members`, `POST rooms/freeze`.
- `api/src/features/stream/stream.dto.ts` — class-validator DTOs; channel ids
  are validated with `@Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })`.
- `api/test/stream-service.test.ts` — node:test suite constructing
  `StreamService` with a fake client via the `STREAM_CLIENT` token and a fake
  seed model. Model new tests after it.

### Auth, throttling, Clerk

- `api/src/env.validation.ts:9` — `CLERK_SECRET_KEY` is zod-required at boot.
  No new env vars are needed for this plan.
- `api/node_modules/@clerk/express` exports **`createClerkClient`** (and a
  `clerkClient` singleton). The api currently uses only `verifyToken` (in
  `api/src/common/clerk-auth.guard.ts`); this plan introduces the first
  backend user lookups.
- `api/src/common/user-throttler.guard.ts:48` — per-route rate-limit
  decorator (own bucket, replaces the shared 120/min budget for that route):
  ```ts
  export const UserThrottle = (options: UserThrottleOptions) =>
    SetMetadata(USER_THROTTLE_KEY, options)
  ```
  Usage exemplar (from its doc comment): `@UserThrottle({ limit: 10, ttl: 60_000 })`.
  Never use the library's `@Throttle()`.

### Venue / booking data (api)

- `api/src/features/venues/venue.schema.ts:27` — `@Prop({ type: String,
  index: true }) ownerId?: string` ("Clerk account that owns this venue's
  brand… absent on ownerless demo seeds"); `info: VenueInfo` (Mixed) carries
  `info.name`; `venueId` is the unique key.
- `api/src/features/bookings/booking.schema.ts:30-47` — fields you will query:
  `bookingId` (unique), `venueId`, `userId?`, `paymentStatus: PaymentStatus`.
  `PaymentStatus` (shared types) =
  `"awaiting" | "paid" | "refunded" | "partial_refund" | "none"`.
- **Circular-import trap**: `api/src/features/venues/venues.module.ts` imports
  `StreamModule` (venue cancel freezes room chats). Therefore `StreamModule`
  must **not** import `VenuesModule` or `BookingsModule`. Register the `Venue`
  and `Booking` schemas directly in `StreamModule` via
  `MongooseModule.forFeature` (registering the same schema from several
  modules is fine in Nest and already done elsewhere in this repo).

### Web chat feature

- `web/features/chat/stream-provider.tsx` — `StreamChatProvider` is mounted
  in `web/app/[locale]/dashboard/layout.tsx` and wraps **all** dashboard
  routes, including the venue workspace at `/dashboard/venue/[venueId]/*`.
  Exposes `useStreamClient()` (null while connecting/degraded) and
  `useStreamChatStatus()`.
- `web/features/chat/chat.tsx` — `ChatView({ initialChannelId })`:
  - `ChannelList filters={{ type: "messaging", members: { $in: [userId] } }}`
    (line 106) — member-based, so any new channel the user is in appears
    automatically.
  - `InitialChannel` (153–174) deep-links via `/dashboard/chat?channel=<id>`:
    `client.channel("messaging", id).watch()` then `setActiveChannel`.
  - `TeamChannelHeader` (182–247): `isGroup = memberList.length > 2`; groups
    render the channel name; 2-member channels render the *other member's*
    name and online dot. You will add a venue branch here.
- `web/features/chat/channel-list.tsx` — `ChannelListItem` (24–89) titles a
  row with `displayTitle ?? channel.data?.name ?? channel.id`;
  `ChannelListHeader` (92–99) is a plain header ("Chats" via Stream i18n) —
  you will add the "new chat" button here.
- `web/features/chat/stream-actions.ts` — `"use server"` actions wrapping
  `apiFetch` (e.g. `createRoomChat` posts `/api/stream/rooms`). Follow this
  file's pattern for the three new actions.
- `web/features/chat/stream-chat.d.ts` — web-side mirror of the
  `CustomChannelData { name?: string }` augmentation. Keep it mirrored.
- `web/features/chat/channel-ids.ts` — client-side id helpers. The new
  channel ids are hash-based and **returned by the api**, so no new helpers
  are needed here (do not try to recompute hashes client-side).

### Booking entry points (web)

- `web/lib/shared/types.ts:139-159` — the `Booking` interface has `venue`
  (name string) but **no `venueId`**. Its projection,
  `sessionToBooking` (`web/lib/shared/helpers.ts:646-664`), maps a
  `PlaySession` (which *does* carry `venueId?` — types.ts:232) to a Booking
  and currently drops it. Both files have byte-identical twins at
  `api/src/shared/types.ts` and `api/src/shared/helpers.ts` (same line
  numbers; only import extensions differ) — **edit all four**.
- `web/features/booking/bookings.tsx` — the calendar-event popover
  (`CalendarEvent`, 442+) renders per-booking actions at lines 593–616:
  "rebook" when `closed`, else "add team" (`addTeamToSession(booking.id)`)
  and cancel. The "message the venue" button goes in this actions block.
- `web/features/booking/payment-return.tsx` — `PaymentReturnView({ bookingId })`;
  the `bookingId` prop **is the api's `bookingId`** (SePay redirects to
  `/dashboard/payment/success/[bookingId]`). The `phase === "paid"` branch
  (92–133) renders a "View bookings" button — the venue-chat button goes next
  to it. Note this file uses `useRouter` from `@/i18n/navigation`.

### Venue workspace (web)

- `web/features/venue/nav.ts` — `VenueSectionKey = "command" | "schedule" |
  "analytics" | "customers"`; `venueNav(venueId)` returns `NavItem[]` with
  hrefs under `venueBase(venueId)`. Labels resolve from the `VenueNav` i18n
  namespace by `key` (see the function's doc comment).
- `web/app/[locale]/dashboard/venue/[venueId]/layout.tsx` — wraps venue pages
  in `VenueDataProvider` (seed + `venueId`); route pages are thin async
  server components exporting `generateMetadata` — copy the shape of
  `web/app/[locale]/dashboard/venue/[venueId]/customers/page.tsx`.

### Conventions

- Prettier: no semicolons, double quotes, 2-space, 80-col; run `pnpm format`
  *only on the files you touched* (whole-repo format drifts unrelated files).
- Web imports use `@/*`; compose classes with `cn()`; icons from `lucide-react`.
- i18n: every new user-visible string is a key in **both**
  `web/messages/en.json` and `web/messages/vi.json` (keep key parity).
- Money/format/register conventions don't apply here, but the dashboard's
  informal Vietnamese ("bạn") does.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (api) | `cd api && pnpm install` | exit 0 |
| Typecheck (api) | `cd api && pnpm typecheck` | exit 0 |
| Lint (api) | `cd api && pnpm lint` | exit 0 |
| Tests (api) | `cd api && pnpm test` | all pass (300 at planning time) |
| One test file | `cd api && node --import tsx --test test/stream-service.test.ts` | all pass |
| Build (api) | `cd api && pnpm build` | exit 0 |
| Typecheck (web) | `cd web && pnpm typecheck` | exit 0 |
| Lint (web) | `cd web && pnpm lint` | exit 0 |
| Tests (web) | `cd web && pnpm test` | all pass (27–32 at planning time) |
| Build (web) | `cd web && pnpm build` | exit 0 |
| Shared-copy sync | `diff <(sed 's/\.js"/"/g' api/src/shared/types.ts) web/lib/shared/types.ts` | no output |

## Scope

**In scope** (the only files you should modify/create):

api:
- `api/src/features/stream/stream.service.ts` (extend)
- `api/src/features/stream/stream.controller.ts` (extend)
- `api/src/features/stream/stream.dto.ts` (extend)
- `api/src/features/stream/stream.module.ts` (extend)
- `api/src/features/stream/clerk-directory.service.ts` (create)
- `api/src/shared/types.ts`, `api/src/shared/helpers.ts` (additive mirror edit)
- `api/test/stream-service.test.ts` (extend) and/or
  `api/test/stream-community.test.ts` (create)

web:
- `web/lib/shared/types.ts`, `web/lib/shared/helpers.ts` (additive mirror edit)
- `web/features/chat/stream-chat.d.ts`, `stream-actions.ts`, `chat.tsx`,
  `channel-list.tsx` (extend)
- `web/features/chat/new-chat-dialog.tsx` (create)
- `web/features/booking/bookings.tsx`, `web/features/booking/payment-return.tsx` (extend)
- `web/features/venue/nav.ts` (extend)
- `web/features/venue/messages.tsx` (create)
- `web/app/[locale]/dashboard/venue/[venueId]/messages/page.tsx` (create)
- `web/messages/en.json`, `web/messages/vi.json` (add keys)
- lockfiles only if an install is genuinely needed (it should not be — no new
  packages)

**Out of scope** (do NOT touch, even though they look related):
- `api/src/features/rooms/**` and the room-chat endpoints/actions — the
  match-room membership flow is server-authoritative and separate.
- `api/src/features/venues/venues.service.ts`, `bookings.service.ts`,
  `payments.*` — venue chat reads bookings; it must not alter booking flows.
- `web/features/play/session.tsx` — the Booking projection changes live in
  `lib/shared/helpers.ts`, not the store.
- `web/features/chat/ai-native-dashboard.tsx`, `assistant-home.tsx` — the AI
  chat surface (dirty in the operator's tree; unrelated).
- Stream demo seeding (`seedForUser`) and token flow.
- No new npm dependencies, no `NEXT_PUBLIC_*` env vars, no api env vars.

## Git workflow

- Branch: `advisor/014-community-chat` (from the current default branch tip).
- Commit per logical unit, message style from `git log`: lowercase
  `api: …` / `web: …` prefixes (e.g. `api: venue/dm/group chat + Clerk user
  search in stream feature`, `web: message-the-venue buttons, new-chat
  dialog, venue inbox`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: api — Clerk directory service

Create `api/src/features/stream/clerk-directory.service.ts`. Bind the Clerk
backend client behind a DI token (same testability pattern as
`STREAM_CLIENT`):

```ts
import { Inject, Injectable } from "@nestjs/common"
import type { createClerkClient } from "@clerk/express"

export const CLERK_CLIENT = Symbol("CLERK_CLIENT")
export type ClerkBackendClient = ReturnType<typeof createClerkClient>

export interface DirectoryUser {
  id: string
  name: string
  image?: string
  /** Present only when the lookup was an exact-email query. */
  email?: string
}

@Injectable()
export class ClerkDirectoryService {
  constructor(@Inject(CLERK_CLIENT) private readonly clerk: ClerkBackendClient) {}
  // …
}
```

Methods (all return `DirectoryUser`/arrays; map a Clerk `User` via a private
helper — display name = `fullName`-equivalent from
`[firstName, lastName].filter(Boolean).join(" ")`, falling back to the
primary email's local part, falling back to `"Người chơi"`; `image` =
`imageUrl`):

- `search(callerId: string, q: string): Promise<DirectoryUser[]>` — trim `q`;
  if it contains `"@"` → `this.clerk.users.getUserList({ emailAddress: [q], limit: 5 })`
  and include `email: q` on results; else →
  `this.clerk.users.getUserList({ query: q, limit: 8 })` with **no email** on
  results. Filter out `callerId`. Return `[]` on a Clerk API error (log via
  Nest `Logger`) — search must degrade, not 500.
- `getMany(ids: string[]): Promise<DirectoryUser[]>` —
  `getUserList({ userId: ids, limit: ids.length })`; no email field.
- `getOne(id: string): Promise<DirectoryUser | null>` —
  `this.clerk.users.getUser(id)`, null on error/missing.

Note: `getUserList` returns a paginated object in current Clerk SDKs (e.g.
`{ data, totalCount }`) — check the installed types and unwrap accordingly.

**Verify**: `cd api && pnpm typecheck` → exit 0.

### Step 2: api — module wiring

In `api/src/features/stream/stream.module.ts`:

- Add to `MongooseModule.forFeature([...])`: `{ name: Venue.name, schema:
  VenueSchema }` and `{ name: Booking.name, schema: BookingSchema }`,
  imported from `../venues/venue.schema.js` and
  `../bookings/booking.schema.js`. **Do not import VenuesModule or
  BookingsModule** (circular — see Current state).
- Add providers: `ClerkDirectoryService` and

  ```ts
  {
    provide: CLERK_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      createClerkClient({ secretKey: config.getOrThrow<string>("CLERK_SECRET_KEY") }),
  }
  ```

  with `createClerkClient` imported from `@clerk/express`.

**Verify**: `cd api && pnpm typecheck && pnpm build` → exit 0.

### Step 3: api — StreamService: conversations + venue chat

In `api/src/features/stream/stream.service.ts`:

1. Extend the augmentation (keep `name`):

   ```ts
   declare module "stream-chat" {
     interface CustomChannelData {
       name?: string
       /** Owning venue of a player↔venue chat (absent on all other channels). */
       venueId?: string
     }
   }
   ```

2. Add id helpers next to `roomChannelId` (use `createHash` from
   `node:crypto`):

   ```ts
   /** Deterministic DM channel id for a user pair (order-independent). */
   export const dmChannelId = (a: string, b: string) =>
     `dm-${createHash("sha256").update([a, b].sort().join(":")).digest("hex").slice(0, 40)}`

   /** Deterministic per-(player, venue) chat channel id. */
   export const venueChannelId = (venueId: string, userId: string) =>
     `venue-${createHash("sha256").update(`${venueId}:${userId}`).digest("hex").slice(0, 40)}`
   ```

3. Inject the two new models and the directory service (constructor):
   `@InjectModel(Venue.name) venues: Model<VenueDocument>`,
   `@InjectModel(Booking.name) bookings: Model<BookingDocument>`,
   `private readonly directory: ClerkDirectoryService`.

4. `async createConversation(userId: string, input: { memberIds: string[]; name?: string }): Promise<{ id: string }>`
   - Dedupe `memberIds`, drop `userId` itself; if empty →
     `BadRequestException("Chọn ít nhất một người để trò chuyện")`.
   - `const users = await this.directory.getMany(memberIds)`; if
     `users.length !== memberIds.length` →
     `NotFoundException("Không tìm thấy người dùng")` (prevents upserting
     junk ids into Stream).
   - `await this.client.upsertUsers([{ id: userId }, ...users.map(u => ({ id: u.id, name: u.name, ...(u.image ? { image: u.image } : {}) }))])`
   - One member → DM: id = `dmChannelId(userId, memberIds[0])`, **no `name`**
     (the UI derives the other member's name), `created_by_id: userId`,
     `members: [userId, memberIds[0]]`. Ignore any provided name.
   - More than one → group: require `input.name` (else
     `BadRequestException("Nhóm cần có tên")`); id =
     `` `group-${randomUUID().replaceAll("-", "")}` `` (`node:crypto`);
     `name: input.name`, `created_by_id: userId`,
     `members: [userId, ...memberIds]`.
   - `await channel.create()`; return `{ id }`. (`create()` is idempotent
     get-or-create — repeat DMs are safe.)

5. `async openVenueChat(userId: string, input: { venueId?: string; bookingId?: string }): Promise<{ id: string }>`
   - Resolve the venue id: if `input.bookingId` — load
     `this.bookings.findOne({ bookingId: input.bookingId }).lean()`; missing
     or `doc.userId !== userId` →
     `NotFoundException("Không tìm thấy lượt đặt sân")`; use its `venueId`.
     Else use `input.venueId`; if neither field →
     `BadRequestException("Thiếu venueId hoặc bookingId")` (also enforce
     exactly-one-of at the DTO level being *at least* one; both present is
     fine — bookingId wins).
   - Load the venue (`this.venues.findOne({ venueId }).lean()`); missing →
     `NotFoundException("Không tìm thấy sân")`. No `ownerId` →
     `BadRequestException("Sân này chưa hỗ trợ nhắn tin")`.
   - Owner shortcut: if `userId === venue.ownerId`, reject with
     `BadRequestException("Bạn là chủ sân này")` (the operator reaches these
     threads via the venue inbox, not by opening a chat with themselves).
   - Eligibility: `await this.bookings.exists({ userId, venueId,
     paymentStatus: { $in: ["paid", "refunded", "partial_refund"] } })`;
     if not →
     `ForbiddenException("Bạn cần hoàn tất một lượt đặt sân trước khi nhắn tin với sân")`.
   - Upsert both parties: the caller (`{ id: userId }`) and the owner with a
     real display name — `const owner = await this.directory.getOne(venue.ownerId)`,
     name fallback `venue.info.name`.
   - Channel: id = `venueChannelId(venueId, userId)`, data
     `{ name: venue.info.name, venueId, created_by_id: userId, members: [userId, venue.ownerId] }`,
     `await channel.create()`; return `{ id }`.

`venue.info` is a Mixed subdocument typed as the shared `Venue` info — access
`venue.info.name` (string).

**Verify**: `cd api && pnpm typecheck && pnpm lint` → exit 0.

### Step 4: api — DTOs + controller routes

`api/src/features/stream/stream.dto.ts` — add (class-validator, matching the
file's style):

```ts
export class UserSearchQueryDto {
  @IsString()
  @Length(3, 64)
  q: string
}

export class CreateConversationBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  memberIds: string[]

  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string
}

export class VenueChatBodyDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  venueId?: string

  @IsOptional()
  @IsString()
  @Length(1, 64)
  bookingId?: string
}
```

(Import the extra validators from `class-validator`; at-least-one-of for
`VenueChatBodyDto` is enforced in the service, per Step 3.)

`api/src/features/stream/stream.controller.ts` — add routes (imports:
`Get`, `Query`; `UserThrottle` from
`../../common/user-throttler.guard.js`; `ClerkDirectoryService`):

```ts
/** Find real users by name (partial) or email (exact) to start a chat with. */
@UserThrottle({ limit: 30, ttl: 60_000 })
@Get("users/search")
searchUsers(@UserId() userId: string, @Query() query: UserSearchQueryDto) {
  return this.directory.search(userId, query.q)
}

/** Start a DM (1 member) or a named group chat (2+ members). */
@Post("conversations")
createConversation(@UserId() userId: string, @Body() body: CreateConversationBodyDto) {
  return this.stream.createConversation(userId, body)
}

/** Open (get-or-create) the caller's chat with a venue — needs a paid booking there. */
@Post("venue-chats")
openVenueChat(@UserId() userId: string, @Body() body: VenueChatBodyDto) {
  return this.stream.openVenueChat(userId, body)
}
```

Inject `ClerkDirectoryService` in the controller constructor alongside
`StreamService`.

**Verify**: `cd api && pnpm typecheck && pnpm lint && pnpm build` → exit 0.

### Step 5: api — tests

Create `api/test/stream-community.test.ts` (node:test + tsx, modeled
structurally on `api/test/stream-service.test.ts` — fake `STREAM_CLIENT`
client object recording `upsertUsers`/`channel` calls, fake models as plain
objects with the methods the service calls). Fake `ClerkDirectoryService` as
a plain object. Cover at least:

1. `createConversation` with one member produces the deterministic dm id —
   same id regardless of argument order — and never sets a `name`.
2. `createConversation` with 2+ members and no `name` →
   `BadRequestException`; with a name → channel created with
   `members = [caller, ...ids]` and `created_by_id = caller`.
3. `createConversation` with an unknown member id (directory returns fewer
   users) → `NotFoundException`, and `upsertUsers` was **not** called.
4. `openVenueChat` happy path (venue with `ownerId`, eligible booking) →
   channel data carries `venueId`, `name = venue.info.name`, members
   `[caller, ownerId]`; id equals `venueChannelId(venueId, caller)`.
5. `openVenueChat` on a venue without `ownerId` → `BadRequestException`.
6. `openVenueChat` with no qualifying booking (`exists` → null) →
   `ForbiddenException`.
7. `openVenueChat({ bookingId })` resolves the venue via the booking and
   rejects when `booking.userId` ≠ caller (`NotFoundException`).
8. `ClerkDirectoryService.search`: an `@` query calls `getUserList` with
   `emailAddress` and results carry `email`; a plain query calls it with
   `query` and results carry **no** `email`; the caller id is filtered out.
   (Construct the service directly with a fake `clerk.users` object.)

**Verify**: `cd api && pnpm test` → all pass, including the new file.

### Step 6: shared types — Booking.venueId (all four files)

- `web/lib/shared/types.ts` (~line 151, inside `interface Booking`): add

  ```ts
  /** Owning venue — set on real (server-backed) bookings; absent on legacy seeds. */
  venueId?: string
  ```

- `web/lib/shared/helpers.ts` `sessionToBooking` (~line 657): add
  `venueId: s.venueId,` to the returned object.
- Mirror both edits byte-identically in `api/src/shared/types.ts` and
  `api/src/shared/helpers.ts` (same locations; the api copies use `.js`
  import extensions elsewhere but these edits are extension-free).

**Verify**:
`diff <(sed 's/\.js"/"/g' api/src/shared/types.ts) web/lib/shared/types.ts && diff <(sed 's/\.js"/"/g' api/src/shared/helpers.ts) web/lib/shared/helpers.ts`
→ no output; `cd api && pnpm typecheck` and `cd web && pnpm typecheck` → exit 0.

### Step 7: web — augmentation + server actions

- `web/features/chat/stream-chat.d.ts`: add `venueId?: string` to the
  `CustomChannelData` augmentation (mirroring Step 3.1).
- `web/features/chat/stream-actions.ts`: add three actions following the
  file's existing `apiFetch` pattern:

  ```ts
  export interface FoundUser {
    id: string
    name: string
    image?: string
    email?: string
  }

  /** Find real users by name (partial) or email (exact). */
  export async function searchUsers(q: string): Promise<FoundUser[]> {
    return apiFetch<FoundUser[]>(
      `/api/stream/users/search?q=${encodeURIComponent(q)}`
    )
  }

  /** Start a DM (one member) or a named group chat (2+). Returns the channel id. */
  export async function createConversation(input: {
    memberIds: string[]
    name?: string
  }): Promise<{ id: string }> { … POST /api/stream/conversations … }

  /** Open the caller's chat with a venue (needs a completed booking there). */
  export async function openVenueChat(input: {
    venueId?: string
    bookingId?: string
  }): Promise<{ id: string }> { … POST /api/stream/venue-chats … }
  ```

  Check how `apiFetch` signals HTTP errors (see `web/lib/api.ts`) — the
  callers in Steps 8/10 need a catchable failure carrying the api's
  Vietnamese `{ error }` message where feasible, else a generic toast.

**Verify**: `cd web && pnpm typecheck` → exit 0.

### Step 8: web — new-chat dialog + header button

Create `web/features/chat/new-chat-dialog.tsx` (`"use client"`):

- Props: `{ open, onOpenChange }`. Use `Dialog`/`DialogContent`… from
  `@/components/ui/dialog`, `Input`, `Button`, `Avatar`, `Skeleton`;
  `useRouter` from `@/i18n/navigation`; `toast` from the repo's sonner setup
  (see how `web/features/play/active-room.tsx` or nearby features import it);
  translations from the `Chat` namespace.
- State: `query`, `results: FoundUser[]`, `selected: FoundUser[]`,
  `groupName`, `searching`, `creating`.
- Debounced search: on `query` change (length ≥ 3 after trim), `setTimeout`
  350ms → `searchUsers(query)` → set results (guard stale responses with a
  cancelled flag, same pattern as `payment-return.tsx`'s poll effect).
  **Repo eslint errors on synchronous `setState` inside effects** — setting
  state after an `await`/timeout callback is fine; do not set state
  synchronously in the effect body.
- Results render name + avatar (+ `email` under the name when present);
  clicking toggles selection (chips row above the input for selected users).
- When `selected.length > 1`, show a required group-name `Input`.
- Submit: `createConversation({ memberIds: selected.map(u => u.id), name })`
  → `router.push(\`/dashboard/chat?channel=${id}\`)`, close the dialog;
  on error → `toast.error(t("createFailed"))`.
- Empty states: hint under 3 chars (`t("searchHint")`), `t("noResults")`.

Wire it up in `web/features/chat/channel-list.tsx` `ChannelListHeader`: add a
ghost icon `Button` (`MessageSquarePlus` from lucide) on the right of the
header row that opens the dialog (local `useState`). Render nothing extra
when the venue-inbox context of Step 9 is active (operators don't start
ad-hoc chats from the inbox).

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 9: web — venue-aware chat rendering + venue inbox mode

In `web/features/chat/chat.tsx`:

1. Add a module-level exported context (or a tiny separate file if chat.tsx
   imports get circular):
   `export const VenueInboxContext = React.createContext(false)` — `true`
   when ChatView renders inside the venue workspace.
2. `ChatView` gains an optional prop `venueInboxId?: string`. When set:
   - wrap the body in `<VenueInboxContext.Provider value={true}>`,
   - ChannelList filters become
     `{ type: "messaging", members: { $in: [userId] }, venueId: venueInboxId }`
     (custom-field filters are supported by Stream's channel query; the field
     is set in Step 3),
3. `TeamChannelHeader`: read `const inbox = React.useContext(VenueInboxContext)`
   and `const venueChat = Boolean(channel.data?.venueId)`.
   - `venueChat && !inbox` (player side): render the group-style branch but
     with the venue's name (`channel.data?.name`) and a `MapPin` icon +
     `t("venueChat")` subtitle instead of the member count.
   - `venueChat && inbox` (operator side): render the DM-style branch (other
     member = the player) but **skip** the profile-dialog wiring — the player
     is a real Clerk user, `playerInitialsFromStreamId` returns null, and the
     button is already disabled in that case; verify it stays disabled.
   - all other channels: unchanged.
4. `ChannelListItem` (`channel-list.tsx`): when
   `React.useContext(VenueInboxContext)` is true and `channel.data?.venueId`
   is set, title the row with the *other* member's name instead of the
   channel (venue) name — get the current user via
   `useChatContext().client.userID` and pick the other entry from
   `Object.values(channel.state.members)`. Player-side rows need no change
   (Stream's `displayTitle` uses the channel name, i.e. the venue).

Create `web/features/venue/messages.tsx`: a `"use client"` view that reads
`useVenueData()` (see `web/features/venue/venue-data-provider.tsx` for the
hook name/shape — STOP if it doesn't expose the venue id) and renders
`<ChatView venueInboxId={venueId} />`, plus a page heading consistent with
sibling venue views (look at how `customers`' view lays out its header).

Create `web/app/[locale]/dashboard/venue/[venueId]/messages/page.tsx` copying
the structure of `customers/page.tsx` (async server component,
`generateMetadata` from a new `VenueMessages` namespace, render the view).

`web/features/venue/nav.ts`: add `"messages"` to `VenueSectionKey` and an
entry in `venueNav` between `schedule` and `analytics`:

```ts
{
  key: "messages",
  href: `${base}/messages`,
  label: "Messages",
  icon: MessageSquare,
  caption: "Chat with your players",
},
```

(`MessageSquare` from lucide; the label/caption strings are defaults — the
sidebar resolves display text from the `VenueNav` i18n namespace by key, so
add the keys in Step 11.)

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 10: web — booking entry points

1. `web/features/booking/bookings.tsx`, inside `CalendarEvent`'s actions
   block (lines 593–616): add a "message the venue" button rendered whenever
   `booking.venueId` is set and `booking.status !== "cancelled"` — visible in
   both the `closed` (completed) and active branches, above "rebook"/"add
   team". On click:

   ```ts
   const [opening, startOpening] = React.useTransition()
   // …
   onClick={() =>
     startOpening(async () => {
       try {
         const { id } = await openVenueChat({ venueId: booking.venueId })
         router.push(`/dashboard/chat?channel=${id}`)
       } catch {
         toast.error(t("messageVenueFailed"))
       }
     })
   }
   ```

   with `useRouter` from `@/i18n/navigation`, a `MessageSquare` icon, label
   `t("messageVenue")`, and the button disabled while `opening`. Follow the
   file's existing Button styling (`size="sm" variant="outline"
   className="w-full justify-start rounded-full"`).

2. `web/features/booking/payment-return.tsx`, in the `phase === "paid"`
   branch next to the "View bookings" button: a secondary
   (`variant="outline"`) rounded-full button labeled `t("messageVenue")`
   (namespace `PaymentReturn`) that calls
   `openVenueChat({ bookingId })` and pushes
   `/dashboard/chat?channel=${id}`; on failure `toast.error(t("messageVenueFailed"))`.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 11: i18n keys (both locales, Vietnamese-first)

Add to **both** `web/messages/vi.json` and `web/messages/en.json` (vi copy
authoritative; en equivalent). Exact key names below; nest them in the
existing namespaces:

- `Chat`: `newChat` ("Cuộc trò chuyện mới" / "New chat"), `searchPlaceholder`
  ("Tìm theo tên hoặc email…" / "Search by name or email…"), `searchHint`
  ("Nhập ít nhất 3 ký tự" / "Type at least 3 characters"), `noResults`
  ("Không tìm thấy người dùng nào" / "No users found"), `groupNamePlaceholder`
  ("Tên nhóm" / "Group name"), `create` ("Bắt đầu trò chuyện" / "Start chat"),
  `creating` ("Đang tạo…" / "Creating…"), `createFailed`
  ("Không tạo được cuộc trò chuyện, thử lại nhé" / "Couldn't start the chat,
  please try again"), `venueChat` ("Nhắn tin với sân" / "Venue chat").
- `Bookings`: `messageVenue` ("Nhắn tin cho sân" / "Message the venue"),
  `messageVenueFailed` ("Không mở được cuộc trò chuyện với sân" / "Couldn't
  open the venue chat").
- `PaymentReturn`: `messageVenue`, `messageVenueFailed` (same copy as above).
- `VenueNav`: keys for the `messages` section following however the existing
  four venue-nav keys are structured (inspect the `VenueNav` namespace in
  `vi.json` first and mirror its shape exactly) — label "Tin nhắn" /
  "Messages", caption "Trò chuyện với người chơi của bạn" / "Chat with your
  players".
- `VenueMessages`: `metaTitle` ("Tin nhắn" / "Messages"), `metaDescription`
  ("Trò chuyện với người chơi đã đặt sân của bạn" / "Chat with players who
  booked your venue"), plus any heading keys your Step 9 view uses.

**Verify**: `cd web && pnpm typecheck && pnpm test` → pass (the test suite
includes i18n checks; additionally
`node -e "const en=require('./web/messages/en.json'),vi=require('./web/messages/vi.json');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,p+k+'.'):p+k);const a=new Set(flat(en)),b=new Set(flat(vi));console.log([...a].filter(k=>!b.has(k)),[...b].filter(k=>!a.has(k)))"`
from the repo root → two empty arrays).

### Step 12: full gates + manual smoke test

Run every command in "Commands you will need"; all must pass. Then, **if**
the environment has working `api/.env` + `web/.env.local` (real Stream,
Clerk, Mongo credentials) and can run both dev servers, smoke-test:

1. Sign in → `/dashboard/chat` → header shows the new-chat button; searching
   a known user's email finds them; creating a DM lands in
   `?channel=dm-…`; re-creating the same DM lands in the *same* channel.
2. Selecting two users without a name blocks; with a name creates
   `?channel=group-…` and the group renders with its name.
3. With a paid booking at an owned venue: bookings calendar popover shows
   "Nhắn tin cho sân" → opens a channel named after the venue.
4. As the venue owner: `/dashboard/venue/<venueId>/messages` lists the
   player thread titled with the *player's* name; replying works.
5. A booking at a demo (ownerless) venue → the button shows a toast, no
   crash.

If the environment lacks credentials, state that the smoke test was not run
in your report — do not claim it.

## Test plan

Covered by Step 5 (api unit tests — 8 cases listed there) and Step 11's i18n
parity check. No new web unit tests are required: the web test baseline
(vitest, `web/` — see `web/package.json` `test` script) covers shared
helpers; **do** extend the existing shared-helpers test (if one covers
`sessionToBooking`) with an assertion that `venueId` is projected — check
`web/**/*.test.*` for the current coverage and mirror its style; skip if no
such suite exists.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm build` all exit 0
- [ ] `cd api && pnpm test` exits 0; ≥8 new tests in
      `test/stream-community.test.ts` pass
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm build && pnpm test` all exit 0
- [ ] `grep -n "venue-chats\|users/search\|conversations" api/src/features/stream/stream.controller.ts`
      → all three routes present
- [ ] `grep -c "venueId" web/features/chat/stream-chat.d.ts` ≥ 1 and
      `grep -c "venueId" api/src/features/stream/stream.service.ts` ≥ 1
      (augmentations mirrored)
- [ ] `diff <(sed 's/\.js"/"/g' api/src/shared/types.ts) web/lib/shared/types.ts`
      and the same for `helpers.ts` → empty (shared copies still in sync)
- [ ] i18n parity script (Step 11) prints two empty arrays
- [ ] `git status` — no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check fails, or `web/messages/*.json` /
  `web/features/chat/ai-native-dashboard.tsx` are dirty with the operator's
  uncommitted work when you start.
- `@clerk/express` does not export `createClerkClient`, or
  `clerk.users.getUserList` lacks the `query` / `emailAddress` / `userId`
  filter params in the installed version's types.
- Importing `venue.schema.js` / `booking.schema.js` into `stream.module.ts`
  creates a compile-time import cycle the build reports (the module-level
  cycle is avoided by design; a schema-file-level cycle would be new
  information).
- Stream rejects the `venueId` custom-field channel filter at runtime (venue
  inbox shows an error where channels should be) — the field name may need
  registering differently; report rather than renaming fields ad hoc.
- `useVenueData()` (or the venue data provider) does not expose the venue id
  to Step 9's view.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `session.tsx`, `bookings.service.ts`,
  `venues.service.ts`, or any other out-of-scope file.

## Maintenance notes

- **Deferred, deliberately**: group member add/remove/leave and group rename;
  an unread badge on the venue workspace "Tin nhắn" nav entry (the player
  sidebar badge counts *all* unreads and already includes venue threads);
  push/notification fan-out on new messages; excluding venue threads from
  the player's main channel list (currently they appear there too — judged
  fine, they're named after the venue); pagination/virtualization of search
  results.
- **Operator-side coupling**: venue chat threads are keyed to
  `venue.ownerId`. If a staff/member concept is ever added to Brand, the
  channel membership model here must be revisited (add staff as members, or
  move to a synthetic venue identity with operator tokens minted after an
  ownership check).
- **Privacy**: the search endpoint returns emails only for exact-email
  queries, is rate-limited (30/min/user, own bucket), and its Clerk errors
  degrade to `[]`. A reviewer should confirm no code path echoes emails for
  name queries.
- **Shared-copy discipline**: `Booking.venueId` now exists in both
  `web/lib/shared` and `api/src/shared`; any future divergence breaks the
  byte-sync diff used in CI review habits.
- **Review scrutiny**: the Mongo `bookings.exists` eligibility query relies
  on the `{ userId, startAt }` index prefix — fine at prototype scale; add a
  compound `{ userId, venueId, paymentStatus }` index if venue-chat opens
  become hot.
