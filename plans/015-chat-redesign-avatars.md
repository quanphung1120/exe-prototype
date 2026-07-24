# Plan 015: Redesign the community chat page — real avatars in the history, one consistent avatar treatment, cleaner flat visual language

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6bbbdc9..HEAD -- web/features/chat api/src/features/stream api/test/stream-service.test.ts`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Context on the operator's local edits**: at planning time the operator had
> an *uncommitted* restyle of `ChatShell` in `web/features/chat/chat.tsx`
> (removing the card wrapper). That edit is NOT in commit `6bbbdc9` and will
> not be in your checkout — this plan instead includes the identical change as
> Step 6 item 1, so you produce it yourself. All excerpts below reflect the
> **committed** state at `6bbbdc9`.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (extends the landed 014 community-chat surface)
- **Category**: direction (UX/design) + small api data change
- **Planned at**: commit `6bbbdc9` (+ uncommitted ChatShell de-carding, see above), 2026-07-24

## Why this matters

The community chat (`/dashboard/chat`, also reused as the venue operator inbox)
renders **every** avatar as an initials-only `AvatarFallback` — even though
real Clerk users already carry an `image` on their Stream user object, the UI
never renders it, and the three seeded demo players have no image at all. The
operator explicitly asked: the other player's avatar must show in the chat
history instead of "the first character of every word in the name". Beyond
that, the page should read as clean/creative/consistent: today four different
files hand-roll the same `Avatar + AvatarFallback + initialsOf` block with
slightly different classes, the header/composer still use `bg-card` from the
old card design the operator is removing, and all fallbacks are the same flat
gray. After this plan: one shared `ChatAvatar` renders the real photo whenever
Stream has one, falls back to a deterministic per-person color gradient,
demo players get seeded avatar images, and the page's chrome matches the new
flat (card-less) direction.

## Current state

**Architecture.** The chat is Stream Chat (GetStream) with fully custom UI:
`web/features/chat/chat.tsx` wires `COMPONENT_OVERRIDES` via `WithComponents`;
the vendor stylesheet is NOT imported. The api (`api/src/features/stream/`)
seeds each new user with 3 demo players + 4 demo channels on first token issue.

**Relevant files:**

- `web/features/chat/chat.tsx` — `ChatView` (two panes) + `TeamChannelHeader`
  (3 branches: venue chat / group / DM). All three branches render
  initials-only avatars (`chat.tsx:247-251`, `262-266`, `282-286`).
- `web/features/chat/message.tsx` — custom Message UI. `AvatarSlot`
  (`message.tsx:303-331`) renders the sender avatar as initials only:

  ```tsx
  // message.tsx:313-319 (working tree)
  const avatar = (
    <Avatar className="size-8 shrink-0">
      <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
        {initialsOf(message.user?.name ?? "?")}
      </AvatarFallback>
    </Avatar>
  )
  ```

- `web/features/chat/channel-list.tsx` — `ChannelListItem` row
  (`channel-list.tsx:75-79`) renders the conversation-list avatar from the
  row **title** initials, never a member's image:

  ```tsx
  // channel-list.tsx:75-79 (working tree)
  <Avatar className="size-10 shrink-0">
    <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
      {initialsOf(title ?? "?")}
    </AvatarFallback>
  </Avatar>
  ```

- `web/features/chat/new-chat-dialog.tsx` — user-search rows already do it
  right (`new-chat-dialog.tsx:207-212`): `AvatarImage` when `u.image` exists,
  initials fallback otherwise. This is the pattern to generalize.
- `web/features/chat/composer.tsx` — message input; container is
  `border-t border-border bg-card p-3` (`composer.tsx:67`, and the frozen
  state at `:60`).
- `web/features/chat/list-chrome.tsx` — list chrome (date pill, empty state,
  etc.). `ChatEmptyState` (`list-chrome.tsx:165-174`) is a bare `<p>`.
- `web/components/ui/avatar.tsx` — base-ui avatar primitives: `Avatar`,
  `AvatarImage` (renders when `src` loads, else the `AvatarFallback` shows),
  `AvatarFallback`, `AvatarBadge` (small ring-ed dot, bottom-right).
- `web/lib/shared/helpers.ts` — `initialsOf(name)` (`helpers.ts:61`) and
  `hashStr(s): number` (`helpers.ts:191`), a **uint32** FNV-style hash used
  across the app for deterministic pseudo-randomness. ⚠️ Repo gotcha: it is
  already unsigned — index with `hashStr(x) % n` (or `>>>`, never `>>`).
- `api/src/features/stream/stream.service.ts` — `DEMO_PLAYERS`
  (`stream.service.ts:56-60`) have `initials` + `name` only, **no image**:

  ```ts
  // stream.service.ts:56-60
  const DEMO_PLAYERS = [
    { initials: "TH", name: "Trần Huy" },
    { initials: "LL", name: "Lê Lan" },
    { initials: "PQ", name: "Phạm Quân" },
  ] as const
  ```

  `seedForUser` (`stream.service.ts:140-206`) claims a Mongo marker
  (`$setOnInsert` upsert; `if (!res.upsertedCount) return` at `:150`) and only
  the winning request runs `upsertUsers` + channel creation — so **already
  seeded users will never receive new demo-player fields** unless the upsert
  moves out of the marker guard. The `catch` at `:197-205` logs and swallows
  (token issuance must not fail on seed errors).
- `api/test/stream-service.test.ts` — unit tests with a fake Stream client
  (`makeService` helper); `api/test/stream-community.test.ts` covers the 014
  surface. Seeding behavior (marker claimed → Stream work runs once) is
  asserted here; the fakes record `upsertUsers` calls.
- The current user's own avatar already works end-to-end: the web passes
  Clerk `imageUrl` into `connectUser`/`refreshStreamToken`
  (`web/features/chat/stream-provider.tsx:82-96`), and Clerk-directory search
  results upsert `image` (`api/src/features/stream/clerk-directory.service.ts:116`).
  So `message.user?.image` / `member.user?.image` is already populated for
  real users — the web just never renders it.

**Conventions to honor** (from `CLAUDE.md`):

- Prettier: no semicolons, double quotes, 2-space indent, 80-col; Tailwind
  classes belong inside `cn()` (registered function) so the plugin sorts them.
- Api relative imports need `.js` extensions (native ESM).
- New user-facing copy must be Vietnamese-first via next-intl — this plan is
  deliberately scoped to need **no new message-catalog keys** (the empty-state
  strings come from Stream's own i18n in `stream-i18n.ts`).
- The operator's decided direction: the chat is **flat** — no card wrapper,
  no `bg-card` panes; it sits directly on the dashboard background. At
  `6bbbdc9`, `ChatShell` (`chat.tsx:171-178`) still has the old card look:

  ```tsx
  // chat.tsx:171-178 (committed state — Step 6 replaces this)
  /** The rounded, ringed two-pane card the chat lives in. */
  function ChatShell({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex h-full min-h-[28rem] overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        {children}
      </div>
    )
  }
  ```
- Theme: emerald/green with a lime `brand` accent; dark mode must work
  (all specified classes below are theme-token based or dual-mode safe).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `cd web && pnpm typecheck` | exit 0 |
| Web lint | `cd web && pnpm lint` | exit 0 |
| Web tests | `cd web && pnpm test` | all pass |
| Api typecheck | `cd api && pnpm typecheck` | exit 0 |
| Api lint | `cd api && pnpm lint` | exit 0 |
| Api tests | `cd api && pnpm test` | all pass (≈314 at planning time) |
| Single api test file | `cd api && node --import tsx --test test/stream-service.test.ts` | all pass |

## Scope

**In scope** (the only files you should modify):

- `web/features/chat/chat-avatar.tsx` (create)
- `web/features/chat/mobile-pane-context.ts` (create — Step 7)
- `web/messages/en.json` + `web/messages/vi.json` (Step 7 only: one new
  `Chat.backToChats` key each, nothing else)
- `web/features/chat/chat.tsx`
- `web/features/chat/message.tsx`
- `web/features/chat/channel-list.tsx`
- `web/features/chat/new-chat-dialog.tsx`
- `web/features/chat/composer.tsx`
- `web/features/chat/list-chrome.tsx`
- `api/src/features/stream/stream.service.ts`
- `api/test/stream-service.test.ts` (adjust fakes/assertions if the upsert
  reordering breaks them; add the new assertions from the Test plan)

**Out of scope** (do NOT touch, even though they look related):

- `web/features/chat/ai-native-dashboard.tsx`, `assistant-home.tsx` — the AI
  assistant home (`/dashboard`), a different page with in-flight operator
  edits.
- `web/features/chat/stream-provider.tsx`, `stream-actions.ts`,
  `stream-i18n.ts`, `channel-ids.ts` — connection/i18n/id plumbing; nothing
  here needs to change.
- `web/features/dashboard/profile-dialog.tsx` — the roster profile dialog
  keeps its own look.
- `web/components/ui/avatar.tsx` — shadcn primitive; wrap it, don't edit it.
- `web/app/globals.css` — holds structural layout for Stream's container divs;
  none of the changes below need it.
- `web/messages/{en,vi}.json` beyond the single `Chat.backToChats` key pair
  added in Step 7 — no other catalog changes.
- `web/lib/shared/` and `api/src/shared/` — the hand-duplicated shared code;
  `hashStr`/`initialsOf` are used as-is.

## Git workflow

- Branch: `advisor/015-chat-redesign-avatars` off current `master`.
- Commit style (from `git log`): lowercase `web:` / `api:` prefix, imperative
  — e.g. `web: message-the-venue buttons, new-chat dialog, venue inbox`.
  Suggested: one `api:` commit (step 1) and one `web:` commit (steps 2–6).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (api): give demo players avatar images and backfill existing users

In `api/src/features/stream/stream.service.ts`:

1. Add an `image` to each `DEMO_PLAYERS` entry — deterministic DiceBear
   avatars (free, hotlinkable, no key). Use these exact URLs:

   ```ts
   // The three mock players whose demo channels every new user is seeded with.
   // Their ids/names mirror the first entries of MATCH_SUGGESTIONS (p1/p2/p3).
   const DEMO_PLAYERS = [
     {
       initials: "TH",
       name: "Trần Huy",
       image:
         "https://api.dicebear.com/9.x/adventurer/svg?seed=tran-huy&backgroundColor=b6e3f4",
     },
     {
       initials: "LL",
       name: "Lê Lan",
       image:
         "https://api.dicebear.com/9.x/adventurer/svg?seed=le-lan&backgroundColor=ffd5dc",
     },
     {
       initials: "PQ",
       name: "Phạm Quân",
       image:
         "https://api.dicebear.com/9.x/adventurer/svg?seed=pham-quan&backgroundColor=c0e8b7",
     },
   ] as const
   ```

2. Restructure `seedForUser` so the **user upsert runs on every call**
   (cheap and idempotent — this is what backfills the new images to
   already-seeded users and keeps the caller's own name/image fresh), while
   the **channel creation stays behind the Mongo marker**. Upsert failures
   must not break token issuance — wrap the always-run upsert in its own
   try/catch that logs via `this.logger.error` and `return`s. Target shape:

   ```ts
   private async seedForUser(
     userId: string,
     name?: string,
     image?: string
   ): Promise<void> {
     // Runs on every token issue (not just first seed) so demo-player
     // avatars and the caller's own name/image propagate to existing users.
     try {
       await this.client.upsertUsers([
         { id: userId, name: name || "You", ...(image ? { image } : {}) },
         ...DEMO_PLAYERS.map((p) => ({
           id: demoPlayerStreamId(p.initials),
           name: p.name,
           image: p.image,
         })),
       ])
     } catch (err) {
       this.logger.error(
         `Failed to upsert Stream users for ${userId}`,
         err instanceof Error ? err.stack : String(err)
       )
       return
     }

     const res = await this.seeds.updateOne(
       { userId },
       { $setOnInsert: { userId } },
       { upsert: true }
     )
     if (!res.upsertedCount) return

     try {
       // …existing channel-creation body, minus the upsertUsers call that
       // used to open it (crew channel, CREW_THREAD, DEMO_DMS loop) —
       // unchanged, including the existing catch/logger block.
     } catch (err) { /* existing block, unchanged */ }
   }
   ```

   Note the ordering is deliberate: users are upserted **before** the marker
   is claimed, so a first-time seed still has its members existing when the
   channels are created (same effective order as today).

3. Run the stream test files. The seeding tests' fake client records
   `upsertUsers` calls and asserts marker-gated behavior — update assertions
   to the new contract: `upsertUsers` is called on **every** `issueToken`,
   channel creation still happens exactly once. Add the new assertions from
   the Test plan below.

**Verify**: `cd api && pnpm typecheck && pnpm lint && pnpm test` → exit 0, all
tests pass.

### Step 2 (web): create the shared `ChatAvatar` component

Create `web/features/chat/chat-avatar.tsx`:

```tsx
"use client"

import { hashStr, initialsOf } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/**
 * Deterministic per-person fallback gradients (indexed by name hash) so
 * initials avatars are tinted consistently everywhere instead of flat gray.
 * hashStr is already a uint32 — plain % is safe (never use a signed >>).
 */
const FALLBACK_GRADIENTS = [
  "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
  "bg-gradient-to-br from-lime-500 to-emerald-600 text-white",
  "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
  "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
  "bg-gradient-to-br from-sky-500 to-indigo-600 text-white",
  "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white",
]

/**
 * The one avatar treatment for the whole chat surface: real photo when the
 * Stream user carries an `image`, otherwise initials on a deterministic
 * gradient. `children` passes through for an AvatarBadge (online dot).
 */
export function ChatAvatar({
  name,
  image,
  className,
  fallbackClassName,
  children,
}: {
  name: string
  image?: string | null
  className?: string
  fallbackClassName?: string
  children?: React.ReactNode
}) {
  const gradient =
    FALLBACK_GRADIENTS[hashStr(name) % FALLBACK_GRADIENTS.length]
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback
        className={cn("text-xs font-medium", gradient, fallbackClassName)}
      >
        {initialsOf(name)}
      </AvatarFallback>
      {children}
    </Avatar>
  )
}
```

**Verify**: `cd web && pnpm typecheck` → exit 0.

### Step 3 (web): render real avatars in the message history

In `web/features/chat/message.tsx`, replace `AvatarSlot`'s hand-rolled avatar
(`message.tsx:313-319`) with `ChatAvatar`, passing the sender's image:

```tsx
const avatar = (
  <ChatAvatar
    name={message.user?.name ?? "?"}
    image={message.user?.image}
    className="size-8 shrink-0"
    fallbackClassName="text-[10px]"
  />
)
```

Update imports: add `ChatAvatar` from `@/features/chat/chat-avatar`; remove
the now-unused `Avatar`/`AvatarFallback` and `initialsOf` imports from this
file (lint will flag any leftovers).

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 4 (web): real avatars + online dot in the conversation list

In `web/features/chat/channel-list.tsx`, `ChannelListItem`:

1. Resolve the DM counterpart regardless of inbox mode (today
   `venueChatOther` is only computed in the operator inbox). Above the
   `title` computation, add:

   ```tsx
   const members = Object.values(channel.state.members ?? {})
   const other = members.find((m) => m.user?.id !== client.userID)
   const isGroup = members.length > 2
   // Player-side venue chats are titled/avatared as the venue, not the
   // owner's personal account; operator inbox rows show the player.
   const isVenueChat = Boolean(channel.data?.venueId)
   const avatarUser =
     !isGroup && (inbox || !isVenueChat) ? other?.user : undefined
   ```

   and rewrite `venueChatOther` in terms of `other`
   (`const venueChatOther = inbox && isVenueChat ? other : undefined` — the
   `title` line at `channel-list.tsx:54-58` stays as is).

2. Replace the avatar block (`channel-list.tsx:75-79`) with:

   ```tsx
   <ChatAvatar
     name={avatarUser?.name ?? title ?? "?"}
     image={avatarUser?.image}
     className="size-10 shrink-0"
   >
     {avatarUser?.online ? <AvatarBadge className="bg-brand" /> : null}
   </ChatAvatar>
   ```

3. Imports: add `ChatAvatar` and `AvatarBadge`
   (`@/components/ui/avatar`); drop unused `Avatar`/`AvatarFallback`/
   `initialsOf`.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 5 (web): unify the header + new-chat dialog on `ChatAvatar`

1. `web/features/chat/chat.tsx`, `TeamChannelHeader` — replace all three
   avatar blocks:
   - venue branch (`:247-251`) → `<ChatAvatar name={name} />`
   - group branch (`:262-266`) → `<ChatAvatar name={name} />`
   - DM branch (`:282-286`) →
     ```tsx
     <ChatAvatar
       name={other?.user?.name ?? name}
       image={other?.user?.image}
     >
       {other?.user?.online ? <AvatarBadge className="bg-brand" /> : null}
     </ChatAvatar>
     ```
   Keep the existing subtitle text (online/offline, member count, venue pin)
   exactly as is. Update imports as in previous steps.
2. `web/features/chat/new-chat-dialog.tsx` — replace the result-row avatar
   (`:207-212`) with `<ChatAvatar name={u.name} image={u.image} />`; drop the
   now-unused avatar/`initialsOf` imports.

**Verify**: `cd web && pnpm typecheck && pnpm lint` → exit 0.

### Step 6 (web): flat, consistent chrome + bubble/empty-state polish

All classes below are complete replacements for the `className` in question.

1. `web/features/chat/chat.tsx` — de-card `ChatShell` (`chat.tsx:171-178`,
   excerpt in "Current state"): replace the wrapper div's className with
   `"flex h-full min-h-[28rem] overflow-hidden"` and the doc comment with
   `/** The two-pane layout the chat lives in — no card wrapper, sits directly on the dashboard background. */`
2. `web/features/chat/chat.tsx` — `TeamChannelHeader`'s `<header>`
   (`chat.tsx:244`): drop the card background to match the de-carded shell:
   `"flex items-center justify-between gap-3 border-b border-border px-4 py-3"`.
3. `web/features/chat/composer.tsx` — same de-carding:
   - frozen banner (`composer.tsx:60`):
     `"border-t border-border p-3 text-center text-sm text-muted-foreground"`
   - input row (`composer.tsx:67`):
     `"flex items-end gap-2 border-t border-border p-3"`
4. `web/features/chat/message.tsx` — bubble corner "tail" so runs read as
   conversations (classic chat cue, subtle): on the bubble div
   (`message.tsx:150-157`), extend the `cn(...)` with one more argument:
   `lastOfGroup && (mine ? "rounded-br-md" : "rounded-bl-md")`.
5. `web/features/chat/list-chrome.tsx` — `ChatEmptyState`
   (`list-chrome.tsx:165-174`): richer but string-free redesign (keeps the
   exact same Stream-translated strings, so no catalog changes):

   ```tsx
   export function ChatEmptyState({ listType }: EmptyStateIndicatorProps) {
     const { t } = useTranslationContext("ChatEmptyState")
     return (
       <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
         <div className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
           <MessagesSquare className="size-6" />
         </div>
         <p className="text-sm text-muted-foreground">
           {listType === "channel"
             ? t("You have no channels currently")
             : t("Nothing yet...")}
         </p>
       </div>
     )
   }
   ```

   Add `MessagesSquare` to the existing `lucide-react` import.

**Verify**: `cd web && pnpm typecheck && pnpm lint && pnpm test` → exit 0, all
tests pass.

### Step 7 (web): mobile responsiveness — single-pane flow below `sm`

**Problem** (operator-requested scope addition): the channel-list `<aside>` in
`ChatView` is `"hidden w-72 shrink-0 flex-col border-r border-border sm:flex"`
(`chat.tsx:118`) — below the `sm` breakpoint the list is completely
unreachable; a phone user only ever sees the conversation pane and can never
switch channels. Fix with the standard messenger pattern: on mobile, show the
list full-width; tapping a row switches to the conversation; a back button in
the conversation header returns to the list. Desktop (`sm+`) keeps the
two-pane layout unchanged.

1. Create `web/features/chat/mobile-pane-context.ts`, modeled exactly on
   `venue-inbox-context.ts` (own file to avoid the chat.tsx → channel-list.tsx
   import cycle — same reason that file exists):

   ```ts
   import * as React from "react"

   /**
    * Which pane the chat shows on mobile (below `sm`, where the two-pane
    * layout collapses to one). Desktop always shows both; these values only
    * affect `hidden` classes behind the `sm:` breakpoint. Lives in its own
    * file (not `chat.tsx`) so `channel-list.tsx` can read it without an
    * import cycle — `chat.tsx` already imports `channel-list.tsx`.
    */
   export const MobilePaneContext = React.createContext<{
     pane: "list" | "conversation"
     showList: () => void
     showConversation: () => void
   }>({ pane: "list", showList: () => {}, showConversation: () => {} })
   ```

2. In `chat.tsx`, `ChatView`: add pane state (deep links land on the
   conversation) and provide the context around `body`:

   ```tsx
   const [pane, setPane] = React.useState<"list" | "conversation">(
     initialChannelId ? "conversation" : "list"
   )
   const showList = React.useCallback(() => setPane("list"), [])
   const showConversation = React.useCallback(
     () => setPane("conversation"),
     []
   )
   const paneCtx = React.useMemo(
     () => ({ pane, showList, showConversation }),
     [pane, showList, showConversation]
   )
   ```

   The callbacks MUST be identity-stable (`useCallback`, and `setPane` from
   `useState` is itself stable): `showConversation` ends up in
   `InitialChannel`'s effect dependency array (step 4), and an unstable
   identity there makes the effect re-run on every `ChatView` render —
   re-forcing the deep-linked channel active and bouncing the mobile back
   button straight back to the conversation. The `useMemo` keeps the context
   value referentially stable for consumers.

   Wrap the existing `<ChatProfileContext.Provider>` contents (or the
   provider itself) in `<MobilePaneContext.Provider value={paneCtx}>`.
   State lives in `ChatView` and is only set from event handlers /
   async callbacks — never synchronously in an effect (repo eslint rule).

3. `chat.tsx` — responsive pane classes (desktop rendering unchanged):
   - `<aside>` (`:118`):
     `cn("w-full shrink-0 flex-col sm:flex sm:w-72 sm:border-r sm:border-border", pane === "conversation" ? "hidden sm:flex" : "flex")`
     (`cn` from `@/lib/utils` — add the import if absent).
   - `<section>` (`:137`):
     `cn("min-w-0 flex-1 flex-col", pane === "list" ? "hidden sm:flex" : "flex")`
4. `chat.tsx` — `InitialChannel`: it already calls
   `setActiveChannel(channel)` in `.then`; read
   `React.useContext(MobilePaneContext)` and call `showConversation()` right
   after `setActiveChannel(channel)` (async callback — allowed).
5. `chat.tsx` — `TeamChannelHeader`: add a mobile-only back button as the
   first child of the `<header>`, before the existing branches (wrap the
   existing three-branch block and the button in a
   `<div className="flex min-w-0 items-center gap-1">` if needed to keep the
   `justify-between` layout intact):

   ```tsx
   <button
     type="button"
     aria-label={t("backToChats")}
     className="-ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
     onClick={showList}
   >
     <ArrowLeft className="size-5" />
   </button>
   ```

   `showList` from `React.useContext(MobilePaneContext)`; `ArrowLeft` from
   `lucide-react` (add to chat.tsx's existing lucide import).
6. `channel-list.tsx` — `ChannelListItem`: in the row's `onClick`, after the
   existing select logic, call `showConversation()` from
   `React.useContext(MobilePaneContext)`.
7. i18n — add ONE key to the `"Chat"` namespace in both catalogs
   (Vietnamese-first):
   - `web/messages/vi.json`: `"backToChats": "Quay lại danh sách chat"`
   - `web/messages/en.json`: `"backToChats": "Back to chats"`
8. Sanity-check the rest of the page below `sm`: message bubbles already cap
   at `max-w-[75%]`, the composer and header are fluid — no further changes
   expected; if something else needs editing to fit mobile, report it rather
   than touching out-of-scope files.

Commit as a third commit on the branch:
`web: responsive single-pane chat on mobile`.

**Verify**: `cd web && pnpm typecheck && pnpm lint && pnpm test` → exit 0, all
pass; `grep -n "hidden w-72" web/features/chat/chat.tsx` → no matches;
`grep -c "backToChats" web/messages/en.json web/messages/vi.json` → 1 each.

## Test plan

- Extend `api/test/stream-service.test.ts` (model new cases after the existing
  seeding tests and their `makeService` fake-client helper):
  1. `issueToken` for a brand-new user upserts the caller **and** all three
     demo players, each demo player with a non-empty `image` string.
  2. `issueToken` for an **already-seeded** user (marker exists) still calls
     `upsertUsers` (the backfill) but creates no channels.
  3. An `upsertUsers` failure does not throw out of `issueToken` (token still
     issued) and does not claim the seed marker (channels can seed on retry).
- Web has no component tests for the chat feature (the vitest baseline covers
  lib/shared and rate-limit logic); the gates are `pnpm typecheck`,
  `pnpm lint`, `pnpm test` staying green.
- Verification: `cd api && node --import tsx --test test/stream-service.test.ts`
  → all pass including the new cases; full `pnpm test` in both apps green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd api && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] `grep -c "image" api/src/features/stream/stream.service.ts` shows the
      three DiceBear URLs present (`grep -c "api.dicebear.com" …` → `3`)
- [ ] `grep -rn "AvatarFallback" web/features/chat/message.tsx web/features/chat/channel-list.tsx web/features/chat/new-chat-dialog.tsx web/features/chat/chat.tsx`
      → no matches (all four consume `ChatAvatar` instead)
- [ ] `grep -rn "bg-card" web/features/chat/chat.tsx web/features/chat/composer.tsx`
      → no matches (flat chrome)
- [ ] `web/features/chat/chat-avatar.tsx` exists and is imported by the four
      files above
- [ ] `grep -n "hidden w-72" web/features/chat/chat.tsx` → no matches (mobile
      single-pane flow in place)
- [ ] `grep -c "backToChats" web/messages/en.json web/messages/vi.json` → 1
      match in each catalog
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the code in your checkout
  (drifted since `6bbbdc9`). In particular `ChatShell` is EXPECTED to still
  have the `rounded-4xl bg-card` card wrapper — Step 6 item 1 removes it; if
  it's already flat, the operator's local edit landed and Step 6 item 1 is a
  no-op, which is fine, but report it.
- `member.user` / `message.user` objects don't expose an `image` property in
  the installed `stream-chat` types (v9 custom-data changes) and fixing it
  would require editing `stream-chat.d.ts` or `stream-provider.tsx`.
- The api stream tests assert seeding semantics that can't be reconciled with
  "upsert every call, channels once" without touching files outside scope
  (e.g. `stream-community.test.ts` needing structural changes beyond its
  fake-client helper — report rather than refactor).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Live smoke test after merge** (needs real Stream + Clerk creds, not
  available to the executor): open `/dashboard/chat` as a previously-seeded
  user — the three demo DMs and "Badminton Crew" must show DiceBear avatars
  (backfilled on token refresh) in the list, header, and message history; a
  DM with a real Clerk user must show their Clerk photo; the online dot must
  appear on an online DM counterpart.
- Demo avatars hotlink `api.dicebear.com`. If DiceBear is unreachable the UI
  degrades gracefully to the gradient-initials fallback (base-ui shows
  `AvatarFallback` until the image loads). If the operator later wants zero
  external dependencies, swap the URLs for files under `web/public/` and
  re-upsert (the every-call upsert makes that a data-only change).
- The every-call `upsertUsers` adds one Stream API call per token issue
  (per session mount + 24h refresh). Negligible now; if it ever matters,
  gate the demo-player part behind the marker again once all users are
  backfilled, keeping only the caller's own upsert unconditional.
- `PlayerProfileDialog` (out of scope) still renders initials — a follow-up
  could thread the Stream image into it for full consistency.
- **Merge collision to expect**: the operator's working tree carries an
  uncommitted `chat.tsx` edit identical to Step 6 item 1 (plus unrelated
  `assistant-home.tsx` edits). Merging this plan's branch will require
  stashing or discarding the local `chat.tsx` hunk first
  (`git checkout -- web/features/chat/chat.tsx`) — it becomes redundant.
- Reviewer focus: the `channel-list.tsx` counterpart resolution (step 4) —
  venue chats on the player side must keep venue-name identity, operator
  inbox rows must show the player; and the reordered `seedForUser` failure
  path (upsert failure must not claim the marker).
