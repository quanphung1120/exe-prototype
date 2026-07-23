"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import type { Event, StreamChat } from "stream-chat"
import { Chat, useCreateChatClient } from "stream-chat-react"

import type { StreamCredentials } from "@/lib/api"
import { refreshStreamToken } from "@/features/chat/stream-actions"
import { getStreami18n } from "@/features/chat/stream-i18n"

interface StreamState {
  /** The connected client, or null while connecting / in degraded mode. */
  client: StreamChat | null
  /** True when Stream is unconfigured/unreachable (no credentials) — vs merely connecting. */
  degraded: boolean
}

// The Stream connection state, exposed via our *own* context — not
// stream-chat-react's `useChatContext`, which throws when rendered outside
// `<Chat>` (exactly the degraded/connecting case). Consumers (ChatView, the
// unread badge) read this to guard safely.
const StreamContext = React.createContext<StreamState>({
  client: null,
  degraded: true,
})

/** The connected Stream client, or null (degraded/connecting). Never throws. */
export function useStreamClient(): StreamChat | null {
  return React.useContext(StreamContext).client
}

/** Coarse status for UI guards: chat is usable, still connecting, or unavailable. */
export function useStreamChatStatus(): "ready" | "connecting" | "unavailable" {
  const { client, degraded } = React.useContext(StreamContext)
  if (client) return "ready"
  return degraded ? "unavailable" : "connecting"
}

export interface StreamChatProviderProps {
  creds: StreamCredentials | null
  userId: string
  userName: string
  userImage?: string | null
  children: React.ReactNode
}

/**
 * Connects the signed-in user to Stream Chat and wraps the dashboard in `<Chat>`
 * so every chat component (and the sidebar unread badge) shares one client. When
 * `creds` is null (Stream unconfigured/unreachable) it renders children with a
 * null client context and no `<Chat>` — the app stays fully usable, only the
 * chat surface degrades.
 */
export function StreamChatProvider({ creds, ...rest }: StreamChatProviderProps) {
  if (!creds) {
    return (
      <StreamContext.Provider value={{ client: null, degraded: true }}>
        {rest.children}
      </StreamContext.Provider>
    )
  }
  return <ConnectedProvider creds={creds} {...rest} />
}

function ConnectedProvider({
  creds,
  userId,
  userName,
  userImage,
  children,
}: StreamChatProviderProps & { creds: StreamCredentials }) {
  const locale = useLocale()

  // A token *provider*, not the static `creds.token` string — the api signs
  // user tokens with a 24h expiry (see `StreamService.issueToken`), and
  // `stream-chat` calls this again to transparently reconnect once the
  // previous token expires. Re-authenticates through the caller's own Clerk
  // session on every call (the `refreshStreamToken` server action), never an
  // unauthenticated mint.
  const tokenProvider = React.useCallback(
    () => refreshStreamToken({ name: userName, image: userImage }),
    [userName, userImage]
  )

  // Creates, connects and returns the client; handles disconnect on unmount and
  // React StrictMode's double-mount. Returns null while connecting. Never build
  // the client at module scope — that breaks SSR.
  const client = useCreateChatClient({
    apiKey: creds.apiKey,
    tokenOrProvider: tokenProvider,
    userData: {
      id: userId,
      name: userName,
      ...(userImage ? { image: userImage } : {}),
    },
  })

  const i18nInstance = React.useMemo(() => getStreami18n(locale), [locale])

  // Still connecting — expose a null client so downstream consumers show their
  // loading/guarded state instead of crashing on a missing `<Chat>` context.
  if (!client) {
    return (
      <StreamContext.Provider value={{ client: null, degraded: false }}>
        {children}
      </StreamContext.Provider>
    )
  }

  return (
    <StreamContext.Provider value={{ client, degraded: false }}>
      <Chat
        client={client}
        customClasses={CUSTOM_CLASSES}
        i18nInstance={i18nInstance}
      >
        {children}
      </Chat>
    </StreamContext.Provider>
  )
}

/**
 * Tailwind layout for the wrapper divs Stream's logic components render
 * (replacing their str-chat__* classes). All chat visuals are our own
 * components (features/chat/*) — the vendor stylesheet is not imported, and
 * no theme prop is set — so these carry the flex/scroll structure only.
 */
const CUSTOM_CLASSES = {
  // ChannelList root, filling its pane in the ChatShell.
  channelList: "flex h-full w-full min-h-0 flex-col",
  // Channel root — a column so its single child (chatContainer) stretches to
  // full width.
  channel: "flex h-full w-full min-h-0 flex-col",
  // The inner wrapper the SDK puts around header/MessageList/Composer. Without
  // this it's an unstyled block that, as a flex item, collapses to its content
  // width instead of filling the pane — so it must fill and stack them itself.
  chatContainer: "flex min-h-0 w-full flex-1 flex-col",
  // The scrollable message area; its child div is the SDK's InfiniteScroll,
  // stretched so short conversations anchor to the bottom like a chat should.
  messageList:
    "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 " +
    "[&>div]:flex [&>div]:min-h-full [&>div]:flex-1 [&>div]:flex-col [&>div]:justify-end",
}

/** total_unread_count lives on the connected *own* user; narrow past UserResponse. */
function readUnread(client: StreamChat | null): number {
  if (!client) return 0
  return (
    (client.user as { total_unread_count?: number } | undefined)
      ?.total_unread_count ?? 0
  )
}

/**
 * The signed-in user's total unread message count across all channels. Returns 0
 * when there's no connected client (degraded/connecting). Modeled as an external
 * store (`useSyncExternalStore`) subscribed to Stream events that carry
 * `total_unread_count` (new messages, marking a channel read) — this is the
 * React-blessed subscription pattern, so it seeds the initial value without a
 * sync setState in an effect. Reads the client from our own context, so it is
 * safe to call outside `<Chat>` (e.g. the sidebar).
 */
export function useStreamUnreadCount(): number {
  const client = useStreamClient()
  const snapshot = React.useRef(0)

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      snapshot.current = readUnread(client)
      if (!client) return () => {}
      const { unsubscribe } = client.on((event: Event) => {
        if (typeof event.total_unread_count === "number") {
          snapshot.current = event.total_unread_count
          onStoreChange()
        }
      })
      // Reflect the seeded value once the subscription is live.
      onStoreChange()
      return () => unsubscribe()
    },
    [client]
  )

  return React.useSyncExternalStore(
    subscribe,
    () => snapshot.current,
    () => 0
  )
}
