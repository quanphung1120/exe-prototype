# Match Maker improvements — design

Date: 2026-06-19

Six changes to the dashboard, centred on Match Maker. Front-end-only prototype:
all state is client-side, faked with timers and static mock data.

## 1. Responsive `/match-maker`

Cards / header overflow horizontally on ~360px screens. Reproduce at 360–390px
and remove overflow sources:

- Action row (`Quick join` + `Create room`) must wrap and shrink instead of
  forcing width.
- Sport `Tabs` row wraps/scrolls cleanly.
- Audit `RoomCard` inner rows (avatar group + price meter, host line) so nothing
  forces min-width past the viewport.

Verify in-browser at 360/390px — no horizontal scroll.

## 2. Leave match

Add `leaveRoom(roomId)` to `MatchmakingProvider`:

- Remove `USER.initials` from `players`, decrement `joined`.
- Drop id from `joinedIds`; repoint `activeRoomId` to another joined room or null.
- If the user **hosts** the room (`host.initials === USER.initials`, i.e.
  created/matchmade rooms), **remove the room entirely** from the list.
- The room's derived team chat disappears automatically (see §3).

UI:

- `RoomDetail` sheet footer: primary **Leave match** button.
- `RoomCard`: the green **Joined** button flips to **Leave** on hover/focus.

## 3. Team chat appears in `/chat` on join

Lift chat out of `ChatView` local state into a layout-level **`ChatProvider`**
(`components/dashboard/chat-store.tsx`), nested inside `MatchmakingProvider` so it
can read `joinedRooms`, and so threads survive navigation.

Provider owns:

- `chats`: base static `CHATS` **plus** one derived group chat per joined room
  (id `room-${room.id}`, name = resolved room title, `group: true`), newest first.
- `threadFor(chatId)`: base chats → `THREAD`; room chats → a seeded welcome thread
  (`host: welcome, see you at {venue}`), localized via `useTranslations`. Appends
  any user-sent messages.
- `sendMessage(chatId, text)`: appends to a per-chat user-message map.
- `activeChatId` + `setActiveChatId`.
- Read tracking: a room chat shows an unread badge until opened.

`ChatView` consumes the provider instead of `useState`. Leaving / deleting a room
removes its chat (derivation from `joinedRooms`).

## 4. "Open team chat" from match detail

`RoomDetail` gets an **Open team chat** button: `setActiveChatId("room-"+room.id)`,
navigate to `/chat` via `useRouter` from `@/i18n/navigation`, close the sheet.
`ChatView` selects the thread named by `activeChatId`.

## 5. Create Room: max players instead of format

Replace the Format `Select` with a **Max players** stepper (min 2, max 8):

- `capacity = maxPlayers`.
- `format` derived: `2 → "Singles"`, else `"Doubles"` (cards/detail unchanged).
- Update zod schema + form defaults; drop the `format` field.

## 6. Mock notifications

`NotificationsProvider` (`components/dashboard/notifications.tsx`), nested inside
`MatchmakingProvider`, seeded from a new `NOTIFICATIONS` list in `data.ts`:

- Items: `{ id, kind, text, time, read, href?, chatId? }`.
- `unreadCount`, `markAllRead`, `pushNotification`.
- Effect on `joinedRooms` (diff vs a ref): a newly joined room pushes a live
  "New team chat — {title}" notification with `chatId = room-${id}`, `href = /chat`.

`NotificationsButton` (popover, in topbar) replaces the static bell: unread badge,
list with icon/text/time, mark-all-read. Clicking an item with a `chatId` sets the
active chat and routes to `/chat` (the button is inside `ChatProvider`, so it can
use both hooks).

## Provider nesting (`app/[locale]/dashboard/layout.tsx`)

```
MatchmakingProvider
  NotificationsProvider      // reads joinedRooms (push on join)
    ChatProvider             // derives room chats from joinedRooms
      SidebarProvider …
        DashboardTopbar      // notifications + chat + matchmaking
        main > children      // ChatView → chat
  MatchmakingDock / Toaster  // unchanged
```

## i18n

All new strings added to `messages/en.json` and `messages/vi.json`
(`Chat.teamWelcome`, `Chat.*` leave/open, `ActiveRoom.leave`/`openChat`,
`MatchMaker.dialog.maxPlayers`, `Notifications.*`, `Topbar` as needed).

## Out of scope

- Sidebar nav unread badge stays static.
- No backend / persistence beyond in-memory provider state.
