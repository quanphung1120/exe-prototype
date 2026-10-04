"use client"

import * as React from "react"
import type { Channel, Event, StreamChat } from "stream-chat"

import {
  useStreamChatStatus,
  useStreamClient,
} from "@/features/chat/stream-provider"

/** One row of the home page's "Recent chats" — a real Stream conversation. */
export interface RecentChat {
  /** Channel id — deep-links via `/app/chat?channel=<id>`. */
  id: string
  title: string
  /** Photo of the other person in a 1:1 chat; null for groups/venue chats. */
  image: string | null
  isGroup: boolean
  isVenueChat: boolean
  /** Last message text, or null when the conversation has no messages yet. */
  preview: string | null
  /** True when the last message has attachments but no text. */
  previewIsAttachment: boolean
  lastMessageAt: Date | null
  unread: number
}

/** Same channel → row mapping the player-side chat list uses (channel-list.tsx). */
function toRecentChat(channel: Channel, client: StreamChat): RecentChat {
  const members = Object.values(channel.state.members ?? {})
  const other = members.find((m) => m.user?.id !== client.userID)
  const isGroup = members.length > 2
  // Player-side venue chats are titled/avatared as the venue, not the owner.
  const isVenueChat = Boolean(channel.data?.venueId)
  const title =
    channel.data?.name ??
    (isGroup
      ? members
          .filter((m) => m.user?.id !== client.userID)
          .map((m) => m.user?.name ?? m.user?.id)
          .join(", ")
      : (other?.user?.name ?? other?.user?.id)) ??
    channel.id ??
    ""
  const last = channel.state.latestMessages.at(-1)
  return {
    id: channel.id ?? "",
    title,
    image: !isGroup && !isVenueChat ? (other?.user?.image ?? null) : null,
    isGroup,
    isVenueChat,
    preview: last?.text?.trim() || null,
    previewIsAttachment: Boolean(!last?.text && last?.attachments?.length),
    lastMessageAt: last?.created_at
      ? new Date(last.created_at)
      : channel.state.last_message_at
        ? new Date(channel.state.last_message_at)
        : null,
    unread: channel.countUnread(),
  }
}

/** Stream events after which the recent list may have changed. */
const REFRESH_EVENTS = new Set([
  "message.new",
  "notification.message_new",
  "notification.added_to_channel",
  "notification.removed_from_channel",
  "notification.mark_read",
  "channel.deleted",
  "channel.hidden",
])

/**
 * The signed-in user's most recently active conversations (same filter + sort
 * as the Chat page's list), kept fresh from Stream events. `status` is
 * "loading" until the first query resolves, "unavailable" when chat is down.
 */
export function useRecentChats(limit = 3): {
  status: "loading" | "ready" | "unavailable"
  chats: RecentChat[]
} {
  const client = useStreamClient()
  const streamStatus = useStreamChatStatus()
  // Keyed by the client's user so a reconnect as someone else never shows the
  // previous account's rows.
  const [result, setResult] = React.useState<{
    userId: string
    chats: RecentChat[]
  } | null>(null)

  React.useEffect(() => {
    if (!client?.userID) return
    const userId = client.userID
    let active = true

    const load = async () => {
      try {
        const channels = await client.queryChannels(
          { type: "messaging", members: { $in: [userId] } },
          { last_message_at: -1 },
          { limit, state: true, watch: false, message_limit: 1 }
        )
        if (active)
          setResult({
            userId,
            chats: channels.map((c) => toRecentChat(c, client)),
          })
      } catch {
        // Keep whatever we had; the next event retries.
        if (active) setResult((prev) => prev ?? { userId, chats: [] })
      }
    }

    void load()
    const { unsubscribe } = client.on((event: Event) => {
      if (REFRESH_EVENTS.has(event.type)) void load()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [client, limit])

  if (streamStatus === "unavailable")
    return { status: "unavailable", chats: [] }
  if (!client?.userID || result?.userId !== client.userID)
    return { status: "loading", chats: [] }
  return { status: "ready", chats: result.chats }
}
