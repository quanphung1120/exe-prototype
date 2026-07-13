# Replace mock community chat with GetStream.io Stream Chat

## Context

The dashboard's community chat (`/dashboard/chat`) is fully mocked: seed `CHATS`/`THREAD` arrays served through `/api/seed`, a client-side `ChatProvider` (`web/features/chat/chat-store.tsx`) that keeps messages in `useState` (nothing persists), plus dynamically generated "room team chats" bridged from matchmaking and the AI dashboard's "invite to group chat" flow. We're replacing all of it with **GetStream.io Stream Chat**, preferring the external SDK's prebuilt UI for simplicity.

**Confirmed decisions (with user):**
1. **UI**: prebuilt `stream-chat-react` components (ChannelList/Channel/MessageList/MessageInput), themed via Stream CSS variables to match the emerald dashboard. Current custom `chat.tsx` gets rewritten.
2. **Scope**: chat page **and** room/team chats — creating/opening a matchmaking room chat or AI group-chat invite creates a real Stream channel. The mock chat-store is fully removed.
3. **Seeding**: on a user's first token request, the API upserts the mock demo players as Stream users and creates 4 per-user demo channels (group "Badminton Crew" + 3 DMs) with messages — matches the app's seed-on-first-read pattern.

**⚠️ Stale-docs warning:** the `api` is **NestJS + Mongoose** (`@nestjs/*`, `@clerk/express`, guards/modules/controllers), NOT Hono — CLAUDE.md and several code comments are stale. Follow NestJS patterns (template: `api/src/features/sessions/`). The api is ESM NodeNext: **relative imports need `.js` suffixes**.

## Packages

- `api`: `pnpm add stream-chat` (^9.x, latest)
- `web`: `pnpm add stream-chat stream-chat-react` (stream-chat-react ^14.x — peer deps `react ^19`, `stream-chat ^9`; compatible with React 19 / Next 16. Do not install optional emoji-mart peers.)
- Verify latest mutually-compatible versions at install time (user preference: latest but verify compatibility).

## Architecture

- **Token flow**: new NestJS `stream` feature module exposes `POST /api/stream/token` (covered by the global `ClerkAuthGuard`). The dashboard layout (server component, `force-dynamic`) calls it via the existing server-only `apiFetch` and passes `{ apiKey, token }` + user info into a new client `StreamChatProvider`. The Stream API key is **returned by the API response** — `STREAM_API_KEY`/`STREAM_API_SECRET` live only in `api/.env`; no `NEXT_PUBLIC_STREAM_API_KEY` (also avoids docker build-time inlining). `serverClient.createToken(userId)` is a local JWT sign (no network call) — cheap to run per request; no refresh/tokenProvider needed.
- **Identity**: Stream user id = Clerk `userId`. Name/image come from the web (`getServerSession()` → `session.user.{id,name,image}` in `web/lib/auth-server.ts`) posted in the token request body; api upserts on first seed only. No `clerkClient` needed in the api.
- **Seeding**: gated by a new Mongo collection (`StreamSeedState`, unique `userId`, race-safe `$setOnInsert` upsert — same pattern as `ProfileService.getProfile`). Per-user channel ids `demo-ch1-${userId}`…`demo-ch4-${userId}` so demo messages are never shared between users. Channel ids allow `[a-z0-9_-]`, ≤64 chars — Clerk `user_…` ids fit.
- **Room channels**: `POST /api/stream/channels` (get-or-create, id `room-${roomId}`, members = current user + mock players resolved from initials). Called from a `"use server"` action at the three open-chat sites. Channel creation is lazy-on-first-open — no changes inside `web/features/play/session.tsx`. Active channel selected via `/dashboard/chat?channel=<id>`.

---

## Phase 1 — API: `stream` feature module

### Env
- `api/src/env.validation.ts`: add `STREAM_API_KEY` + `STREAM_API_SECRET` to the zod `envSchema` (min(1), fail boot if missing).
- `api/.env.example`: add both keys with a comment pointing to the GetStream dashboard.
- docker-compose already `env_file`s `./api/.env` — no compose change.

### New `api/src/features/stream/`

**`stream-seed.schema.ts`** (mirror `api/src/features/players/profile.schema.ts` style):
```ts
@Schema({ collection: "streamseeds", timestamps: true })
export class StreamSeedState {
  @Prop({ required: true, unique: true, index: true }) userId: string
}
```

**`stream.service.ts`** — inject `ConfigService` + the seed model; hold a `StreamChat.getInstance(key, secret)` client. For testability, bind the client via a factory provider token (e.g. `STREAM_CLIENT`) so tests inject a fake. Id conventions:
```ts
export const demoPlayerStreamId = (initials: string) => `demo-player-${initials.toLowerCase()}` // TH → demo-player-th
export const demoChannelId = (chatId: string, userId: string) => `demo-${chatId}-${userId}`
```
Methods:
- `issueToken(userId, name?, image?)` → `await seedForUser(...)` then return `{ apiKey: client.key, token: client.createToken(userId) }`.
- `seedForUser(userId, name?, image?)` (private): `seeds.updateOne({userId}, {$setOnInsert:{userId}}, {upsert:true})`; if `!res.upsertedCount` return (already seeded). Otherwise `upsertUsers([{id: userId, name, image}, {id:"demo-player-th", name:"Trần Huy"}, {id:"demo-player-ll", name:"Lê Lan"}, {id:"demo-player-pq", name:"Phạm Quân"}])`, then create channels type `"messaging"`:
  - `demo-ch1-${userId}` "Badminton Crew", `created_by_id: "demo-player-th"`, members = user + all 3 mocks; send the 4 old `THREAD` messages server-side (`ch.sendMessage({ text, user_id })`, the "mine" one as `userId`).
  - `demo-ch2..4` DMs (one mock member each), one message each — texts from the old `CHATS[].last` fields ("Bring an extra grip if you have one", "Confirmed for tonight ✅", "Rematch this weekend? 🏓").
  - Move the seed texts from `api/src/data/player.ts` `CHATS`/`THREAD` into this service as private constants (they get deleted from `player.ts` in Phase 5).
- `ensureRoomChannel(userId, { id, name, memberInitials })`: resolve mock players by initials from the players fixture (check how `api/src/data/player.ts` exports them — `PLAYERS` or via `PlayerService`; inject the service if that's the export path), `upsertUsers` them with `demoPlayerStreamId`, then `client.channel("messaging", id, { name, created_by_id: userId, members: [userId, ...mockIds] })` → `channel.create()` (idempotent get-or-create; does not overwrite existing data). Return `{ id }`.

**`stream.controller.ts`** — `@Controller("stream")` (global `/api` prefix + `ClerkAuthGuard` apply automatically). Use `@UserId()` (`api/src/common/user-id.decorator.ts`) and `ZodValidationPipe` (`api/src/common/zod-validation.pipe.ts`):
- `@Post("token")` — body `z.object({ name: z.string().optional(), image: z.string().optional() }).optional()` → `issueToken`.
- `@Post("channels")` — body `z.object({ id: z.string().regex(/^[\w-]{1,64}$/), name: z.string().min(1).max(80), memberInitials: z.array(z.string().min(1).max(4)).max(16) })` → `ensureRoomChannel`.

**`stream.module.ts`** — `MongooseModule.forFeature([...])`, controller + service + `STREAM_CLIENT` factory. **Register in `api/src/app.module.ts` imports.**

## Phase 2 — Web: provider + token plumbing

### `web/lib/api.ts` — add
```ts
export interface StreamCredentials { apiKey: string; token: string }
export async function fetchStreamCredentials(user: { name: string; image?: string | null }): Promise<StreamCredentials | null>
// POST /api/stream/token via apiFetch; catch errors → return null (dashboard must not hard-fail if Stream is down/unconfigured)
```

### New `web/features/chat/channel-ids.ts` (client-safe id helpers mirroring the api conventions)
```ts
export const roomChannelId = (roomId: string) => `room-${roomId}`
export const demoChannelId = (chatId: string, userId: string) => `demo-${chatId}-${userId}`
export const playerInitialsFromStreamId = (id: string) =>
  id.startsWith("demo-player-") ? id.slice("demo-player-".length).toUpperCase() : null
```

### New `web/features/chat/stream-provider.tsx` (`"use client"`)
- `StreamChatProvider({ creds, userId, userName, userImage, children })`:
  - If `creds` is null → render children without `<Chat>` (degraded mode).
  - `useCreateChatClient({ apiKey, tokenOrProvider: token, userData: { id, name, image } })` from `stream-chat-react` (handles connect/disconnect + StrictMode double-mount; never create the client at module scope — SSR breaks).
  - While `client` is null (connecting) → render children **without** `<Chat>`; downstream consumers must guard (see below).
  - Theme: read resolved theme from `@teispace/next-themes` (check the hook the repo already uses, e.g. in `components/theme-provider.tsx`) → `theme={dark ? "str-chat__theme-dark" : "str-chat__theme-light"}` on `<Chat>`.
  - i18n: `Streami18n` ships **no `vi`** — create `web/features/chat/stream-i18n.ts` that builds a `Streami18n` and `registerTranslation("vi", viDict)` with a small dict for visible strings (Send, Type your message, Search, empty states, timestamp config); select by `useLocale()` from next-intl; pass `i18nInstance` to `<Chat>`.
- `useStreamUnreadCount(): number` — returns 0 when no client; otherwise seed from `client.user?.total_unread_count` and subscribe to `client.on` events carrying `total_unread_count`. **`useChatContext` throws outside `<Chat>`** — this hook must not rely on it unguarded.

### Mount in `web/app/[locale]/dashboard/layout.tsx`
- `const [seed, streamCreds] = await Promise.all([fetchSeed(), fetchStreamCredentials(session.user)])`
- Replace `<ChatProvider>` (line 47) with `<StreamChatProvider creds={streamCreds} userId={session.user.id} userName={session.user.name} userImage={session.user.image}>`; drop the `chat-store` import.

## Phase 3 — Rewrite ChatView

**Rewrite `web/features/chat/chat.tsx`** on `stream-chat-react`, keeping the existing outer shell (rounded card, ring, responsive two-pane: list `aside` hidden on mobile + thread `section`):
- `import "stream-chat-react/dist/css/v2/index.css"` once.
- Guard: if no Stream client/context → skeleton or "unavailable" state (new i18n keys).
- `<ChannelList filters={{ type: "messaging", members: { $in: [userId] } }} sort={{ last_message_at: -1 }} options={{ state: true, watch: true }} />` in the left pane.
- Right pane: `<Channel><Window><TeamChannelHeader /><MessageList /><MessageInput focus /></Window></Channel>`.
- `TeamChannelHeader` (custom, same file or `channel-header.tsx`): via `useChannelStateContext()` — reuse the current header JSX (Avatar, online dot, member count with `Chat.members` ICU plural, Phone/Video ghost buttons); for DMs map the other member via `playerInitialsFromStreamId` → open the existing `PlayerProfileDialog` (`web/features/dashboard/profile-dialog.tsx`) on avatar click.
- `initialChannelId` prop: on mount, `client.channel("messaging", id).watch()` then `setActiveChannel(channel)`.

**`web/app/[locale]/dashboard/chat/page.tsx`**: accept `searchParams: Promise<{ channel?: string }>`, pass `initialChannelId={channel}`. Keep metadata.

**Theming — `web/app/globals.css`**: append a scoped `.str-chat { … }` block mapping Stream v2 CSS vars to the existing oklch tokens:
`--str-chat__font-family: var(--font-geist)…`, `--str-chat__primary-color: var(--brand)`, `--str-chat__own-message-bubble-background-color: var(--primary)`, `--str-chat__background-color/secondary-background-color: var(--card)`, `--str-chat__message-bubble-background-color: var(--muted)`, `--str-chat__channel-preview-active-background-color: var(--secondary)`, `--str-chat__unread-badge-background-color: var(--brand)`. Tune at runtime — exact var set may need iteration; vars accept `var(--…)` oklch values.

## Phase 4 — Room/team channels + AI-invite bridge

### New server action `web/features/chat/stream-actions.ts` (mirror `web/features/venue/venue-actions.ts`)
```ts
"use server"
export async function ensureRoomChannel(input: { roomId: string; name: string; memberInitials: string[] }) {
  return apiFetch("/api/stream/channels", { method: "POST",
    body: { id: `room-${input.roomId}`, name: input.name, memberInitials: input.memberInitials } })
}
```

### Rewire the three open-chat sites (all currently `setActiveChatId(roomChatId(id)) + push("/dashboard/chat")`)
- **`web/features/play/active-room.tsx`** (~line 209, `openChat`): make async — `await ensureRoomChannel({ roomId: room.id, name: room.title, memberInitials: <room players minus current user's initials — available via useData()> })`, then `router.push("/dashboard/chat?channel=room-" + room.id)`. try/catch → `toast.error`. Remove `useChat`/`roomChatId` imports.
- **`web/features/chat/ai-native-dashboard.tsx`**:
  - `inviteToChat` (~line 455): after `createInviteRoom(...)` returns the roomId, call `ensureRoomChannel` with the selected players' initials (fire-and-forget is acceptable since `openGroupChat` also ensures).
  - `openGroupChat` (~line 434): `await ensureRoomChannel(...)` (resolve room from `useMatchmaking().joinedRooms`), then `router.push("/dashboard/chat?channel=room-" + roomId)`. Remove `useChat as useChatStore` import.
- **`web/features/dashboard/notifications.tsx`** (~line 160): replace `setActiveChatId(item.chatId)` with `router.push("/dashboard/chat?channel=" + demoChannelId(item.chatId, user.id))` using `useAuthUser()` (`web/features/dashboard/auth-user.tsx`) for `user.id`. Remove `useChat` import.

### Nav badge
- `web/features/dashboard/nav.ts`: remove hardcoded `badge: "2"` from the chat entry.
- In `web/features/dashboard/app-sidebar.tsx` (where `item.badge` renders): for the chat item, render `useStreamUnreadCount()` (hide when 0). Check `player-chrome.tsx` mobile nav for a badge too.

## Phase 5 — Remove the mock chat

- **Delete `web/features/chat/chat-store.tsx`.**
- `api/src/data/player.ts`: delete `CHATS` (~line 465) and `THREAD` (~508) (texts moved into `stream.service.ts` in Phase 1).
- `api/src/features/players/profile.service.ts`: remove `CHATS`/`THREAD` imports + `chats`/`thread` from `seedData()`.
- `api/src/features/players/profile.schema.ts`: remove `chats`/`thread` `@Prop`s, `ProfileData` fields, `toProfileData` mappings. (Stale fields in existing Mongo docs are harmless.)
- `api/src/features/seed/seed.service.ts`: remove `chats: profile.chats, thread: profile.thread` (~lines 84–85).
- `api/src/shared/types.ts` (~237–256) **and** `web/lib/shared/types.ts` (hand-duplicated copies — update both): remove `Chat`/`Message` interfaces and the `chats`/`thread` fields from the `Seed` type; clean `shared/index.ts` re-exports.
- `web/features/dashboard/data-provider.tsx` + `web/features/dashboard/data.ts`: remove `chats`/`thread` from context/re-exports.
- i18n `web/messages/en.json` + `vi.json` ("Chat" namespace, ~line 1078 in en): remove obsolete keys (`chats.ch1..ch4.*`, `thread.m1..m4.*`, `teamWelcome`, `teamCreated`, `now`, `searchPlaceholder`, `inputPlaceholder`, `send`, …) keeping what the new UI uses (`metaTitle`, `metaDescription`, `members`, `online`, `offline`, `call`, `videoCall`); add `loading` + `unavailable`. Apply to both locales.
- Final sweep: grep for `chat-store`, `roomChatId`, `useChat` (community one), `CHATS`, `THREAD` — expect zero non-Stream/non-AI hits. (`web/app/api/chat/route.ts` + `@ai-sdk/react`'s `useChat` are the **AI** chat — untouched.)

## Phase 6 — Tests

New `api/test/stream-service.test.ts` (Node test runner, follow `api/test/sessions-service.test.ts` conventions): construct `StreamService` with a fake `StreamChat` (via the `STREAM_CLIENT` factory/constructor injection) and fake Mongoose model. Assert:
1. `issueToken` returns `{ apiKey, token }` and calls `createToken(userId)`.
2. Seeding runs only when the upsert reports `upsertedCount: 1`; second call performs no `upsertUsers`/`channel` calls.
3. `ensureRoomChannel` maps `["TH"]` → member `demo-player-th` and sets `created_by_id: userId`.
4. The channels zod schema rejects illegal channel-id chars.

## Verification

Requires real Stream app keys in `api/.env` (create an app at getstream.io dashboard → key + secret).

1. `pnpm typecheck && pnpm lint` in both `web/` and `api/`; `pnpm test` in `api/`.
2. Both dev servers (`cd api && pnpm dev`, `cd web && pnpm dev`), sign in → `/dashboard` renders. Also verify the dashboard still loads (chat page shows "unavailable") when `STREAM_API_KEY` is deliberately wrong/missing on the web side fetch failure path.
3. `/dashboard/chat`: 4 seeded channels ("Badminton Crew" + 3 DMs) with messages; sending a message persists across reload; a second Clerk account gets its own fresh demo channels.
4. Theming: emerald accents, Geist font, `l` dark-mode toggle flips the Stream theme; `vi` locale shows registered translations.
5. DM header avatar opens `PlayerProfileDialog`.
6. Play → join a room → open chat → lands on `/dashboard/chat?channel=room-<id>` with team channel + members; re-open is idempotent.
7. AI dashboard → match players → invite to group chat → open group chat → Stream channel with invitees.
8. Chat notification navigates to the demo channel; sidebar badge shows live unread count and clears after reading.
9. `docker compose up` (root `pnpm dev`) still boots.

## Risks / gotchas

- **No `vi` in Streami18n** — must register a custom dict or it silently falls back to English.
- **`useChatContext` throws outside `<Chat>`** — while connecting (client null) the provider renders children without `<Chat>`; every Stream hook consumer (ChatView, unread badge) must guard.
- **`force-dynamic` layout** → token endpoint runs on every dashboard navigation; keep seeding behind the Mongo flag (`createToken` alone is a local sign, cheap).
- **api ESM NodeNext** — `.js` suffixes on relative imports.
- Stream `channel.create()` on an existing id is get-or-create and does **not** overwrite data — safe for idempotent opens, but don't rely on it to rename rooms.
- Old Mongo profile docs keep stale `chats`/`thread` blobs — harmless.
