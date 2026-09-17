"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"
import { useLocale } from "next-intl"
import type { Event, StreamChat } from "stream-chat"
import { Chat, useCreateChatClient } from "stream-chat-react"

import type { StreamCredentials } from "@/lib/api"
import { PUBLIC_API_URL } from "@/lib/public-api"
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
  userId: string
  userName: string
  userImage?: string | null
  children?: React.ReactNode
}

/**
 * Shares one connection with the chat view and the sidebar unread badge.
 * Credentials load after mount so a slow chat service never blocks navigation.
 * Children stay usable while connecting or when the service is unavailable.
 */
export function StreamChatProvider({ ...rest }: StreamChatProviderProps) {
  const { getToken } = useAuth()
  const [creds, setCreds] = React.useState<StreamCredentials | null>(null)
  const [degraded, setDegraded] = React.useState(false)
  const [client, setClient] = React.useState<StreamChat | null>(null)
  const { userName, userImage } = rest

  React.useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => {
      controller.abort()
      if (active) setDegraded(true)
    }, 8_000)

    async function connect() {
      try {
        const token = await getToken()
        if (!token) throw new Error("Authentication required")
        const response = await fetch(`${PUBLIC_API_URL}/api/stream/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: userName,
            image: userImage ?? undefined,
          }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Stream credentials unavailable")
        const credentials = (await response.json()) as StreamCredentials
        if (active) setCreds(credentials)
      } catch {
        if (active) setDegraded(true)
      } finally {
        clearTimeout(timeout)
      }
    }

    void connect()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [getToken, userName, userImage])

  // Keep children in a stable tree while connecting; adding a wrapper when
  // credentials arrive would remount forms and discard in-progress input.
  return (
    <StreamContext.Provider value={{ client, degraded }}>
      {creds ? (
        <StreamConnection creds={creds} {...rest} onClient={setClient} />
      ) : null}
      {rest.children}
    </StreamContext.Provider>
  )
}

function StreamConnection({
  creds,
  userId,
  userName,
  userImage,
  onClient,
}: StreamChatProviderProps & {
  creds: StreamCredentials
  onClient: (client: StreamChat | null) => void
}) {
  const initialToken = React.useRef<string | null>(creds.token)

  // A token *provider*, not the static `creds.token` string — the api signs
  // user tokens with a 24h expiry (see `StreamService.issueToken`), and
  // `stream-chat` calls this again to transparently reconnect once the
  // previous token expires. Re-authenticates through the caller's own Clerk
  // session on every call (the `refreshStreamToken` server action), never an
  // unauthenticated mint.
  const tokenProvider = React.useCallback(async () => {
    // Reuse the credential we just fetched; only refresh on SDK renewal.
    if (initialToken.current) {
      const token = initialToken.current
      initialToken.current = null
      return token
    }
    return refreshStreamToken({ name: userName, image: userImage })
  }, [userName, userImage])

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

  React.useEffect(() => {
    onClient(client ?? null)
    return () => onClient(null)
  }, [client, onClient])
  return null
}

/** SDK UI context is only needed around the chat view, not the whole dashboard. */
export function StreamChatBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const client = useStreamClient()
  const locale = useLocale()
  const i18nInstance = React.useMemo(() => getStreami18n(locale), [locale])
  if (!client) return children
  return (
    <Chat
      client={client}
      customClasses={CUSTOM_CLASSES}
      i18nInstance={i18nInstance}
    >
      {children}
    </Chat>
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
