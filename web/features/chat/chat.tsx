"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MapPin, Users } from "lucide-react"
import {
  Channel,
  ChannelList,
  MessageList,
  WithComponents,
  useChannelStateContext,
  useChatContext,
} from "stream-chat-react"

import { AvatarBadge } from "@/components/ui/avatar"
import { ChatAvatar } from "@/features/chat/chat-avatar"
import { playerInitialsFromStreamId } from "@/features/chat/channel-ids"
import {
  ChannelListHeader,
  ChannelListItem,
  ChannelListPaginator,
  ChannelListShell,
} from "@/features/chat/channel-list"
import { Composer } from "@/features/chat/composer"
import {
  ChatDateSeparator,
  ChatEmptyState,
  ChatLoadingIndicator,
  ChatMessagePanel,
  ChatScrollToBottom,
  ChatSystemMessage,
  ChatTypingIndicator,
  ChatUnreadNotification,
  ChatUnreadSeparator,
} from "@/features/chat/list-chrome"
import { ChatMessage } from "@/features/chat/message"
import {
  useStreamChatStatus,
  useStreamClient,
} from "@/features/chat/stream-provider"
import { ChatProfileContext } from "@/features/chat/profile-context"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"
import { PlayerProfileDialog } from "@/features/dashboard/profile-dialog"

export { VenueInboxContext }

/**
 * Every visual piece the SDK renders is replaced with our own component here;
 * the vendor stylesheet is NOT imported (structural layout for the SDK's
 * container divs lives in globals.css). Slot names follow ComponentContext.
 */
const COMPONENT_OVERRIDES = {
  MessageUI: ChatMessage,
  ChannelListHeader,
  ChannelListItemUI: ChannelListItem,
  ChannelListUI: ChannelListShell,
  DateSeparator: ChatDateSeparator,
  MessageListMainPanel: ChatMessagePanel,
  MessageSystem: ChatSystemMessage,
  TypingIndicator: ChatTypingIndicator,
  UnreadMessagesSeparator: ChatUnreadSeparator,
  UnreadMessagesNotification: ChatUnreadNotification,
  ScrollToLatestMessageButton: ChatScrollToBottom,
  EmptyStateIndicator: ChatEmptyState,
  LoadingIndicator: ChatLoadingIndicator,
}

/**
 * Community chat, built on Stream Chat's *logic* components (ChannelList
 * querying/pagination, Channel state, MessageList scroll management) with
 * fully custom UI — every visible piece is ours (see COMPONENT_OVERRIDES,
 * message.tsx, composer.tsx, channel-list.tsx, list-chrome.tsx). The `<Chat>`
 * provider lives in the dashboard layout; this view renders the two panes and
 * a custom header. When Stream is connecting or unavailable it falls back to
 * a centered status message instead of crashing on a missing context.
 */
export function ChatView({
  initialChannelId,
  venueInboxId,
}: {
  initialChannelId?: string
  /**
   * Set when this view is the venue operator's per-venue inbox
   * (`/dashboard/venue/[venueId]/messages`) rather than a player's own chat —
   * scopes the channel list to that venue's chats and flips the header/row
   * rendering to the operator's perspective (see `VenueInboxContext`).
   */
  venueInboxId?: string
}) {
  const t = useTranslations("Chat")
  const status = useStreamChatStatus()
  const client = useStreamClient()

  const [profileInitials, setProfileInitials] = React.useState<string | null>(
    null
  )
  const [profileOpen, setProfileOpen] = React.useState(false)
  const openProfile = (initials: string) => {
    setProfileInitials(initials)
    setProfileOpen(true)
  }

  if (!client) {
    return (
      <ChatShell>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {status === "connecting" ? t("loading") : t("unavailable")}
        </div>
      </ChatShell>
    )
  }

  const userId = client.userID as string

  const body = (
    <ChatProfileContext.Provider value={openProfile}>
      <WithComponents overrides={COMPONENT_OVERRIDES}>
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border sm:flex">
          <ChannelList
            filters={
              venueInboxId
                ? {
                    type: "messaging",
                    members: { $in: [userId] },
                    venueId: venueInboxId,
                  }
                : { type: "messaging", members: { $in: [userId] } }
            }
            sort={{ last_message_at: -1 }}
            options={{ state: true, watch: true }}
            Paginator={ChannelListPaginator}
          />
        </aside>

        {/* Active conversation. No <Window> — it only exists to coordinate
          with a Thread pane we don't render. */}
        <section className="flex min-w-0 flex-1 flex-col">
          <Channel>
            <TeamChannelHeader
              currentUserId={userId}
              onOpenProfile={openProfile}
            />
            <MessageList />
            <Composer />
          </Channel>
        </section>

        <InitialChannel id={initialChannelId} />
      </WithComponents>
      <PlayerProfileDialog
        initials={profileInitials}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </ChatProfileContext.Provider>
  )

  return (
    <ChatShell>
      {venueInboxId ? (
        <VenueInboxContext.Provider value={true}>
          {body}
        </VenueInboxContext.Provider>
      ) : (
        body
      )}
    </ChatShell>
  )
}

/** The two-pane layout the chat lives in — no card wrapper, sits directly on the dashboard background. */
function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[28rem] overflow-hidden">
      {children}
    </div>
  )
}

/**
 * Watches `initialChannelId` and makes it the active channel on mount — used to
 * deep-link into a specific room/DM via `/dashboard/chat?channel=<id>`. Renders
 * nothing; a missing/inaccessible channel is ignored (the list's default
 * selection stands).
 */
function InitialChannel({ id }: { id?: string }) {
  const { client, setActiveChannel } = useChatContext()

  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    const channel = client.channel("messaging", id)
    channel
      .watch()
      .then(() => {
        if (!cancelled) setActiveChannel(channel)
      })
      .catch(() => {
        // Channel doesn't exist yet / no access — leave the list's pick active.
      })
    return () => {
      cancelled = true
    }
  }, [id, client, setActiveChannel])

  return null
}

/**
 * Custom channel header matching the original chat design: avatar + name and a
 * member count (groups) or online status (DMs). For a DM, tapping the avatar
 * opens the other member's PlayerProfileDialog (resolved from their
 * `demo-player-*` Stream id back to roster initials).
 */
function TeamChannelHeader({
  currentUserId,
  onOpenProfile,
}: {
  currentUserId: string
  onOpenProfile: (initials: string) => void
}) {
  const t = useTranslations("Chat")
  const { channel, members } = useChannelStateContext()
  const inbox = React.useContext(VenueInboxContext)

  const memberList = Object.values(members ?? {})
  const isGroup = memberList.length > 2
  const name = channel.data?.name ?? t("metaTitle")

  const other = memberList.find((m) => m.user?.id !== currentUserId)
  const otherInitials = other?.user?.id
    ? playerInitialsFromStreamId(other.user.id)
    : null

  // Player's own chat with a venue: named after the venue (not the owner's
  // account name) with a map-pin subtitle instead of the usual online status
  // / member count. On the operator side (`inbox`), a venue chat is just a
  // DM with the player and falls through to the normal two-member branch
  // below — the profile-dialog button stays disabled there since
  // `playerInitialsFromStreamId` returns null for a real Clerk id.
  const venueChat = Boolean(channel.data?.venueId)

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      {venueChat && !inbox ? (
        <div className="flex min-w-0 items-center gap-3">
          <ChatAvatar name={name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {t("venueChat")}
            </p>
          </div>
        </div>
      ) : isGroup ? (
        <div className="flex min-w-0 items-center gap-3">
          <ChatAvatar name={name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3" />
              {t("members", { count: memberList.length })}
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!otherInitials}
          className="-m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
          onClick={() => otherInitials && onOpenProfile(otherInitials)}
        >
          <ChatAvatar name={other?.user?.name ?? name} image={other?.user?.image}>
            {other?.user?.online ? <AvatarBadge className="bg-brand" /> : null}
          </ChatAvatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{other?.user?.name ?? name}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {other?.user?.online ? (
                <>
                  <span className="size-1.5 rounded-full bg-brand" />
                  {t("online")}
                </>
              ) : (
                t("offline")
              )}
            </p>
          </div>
        </button>
      )}
    </header>
  )
}
