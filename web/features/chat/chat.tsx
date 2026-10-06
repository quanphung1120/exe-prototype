"use client"

import * as React from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ArrowLeft, Info, MapPin, Users } from "lucide-react"
import {
  Channel,
  ChannelList,
  MessageList,
  WithComponents,
  useChannelStateContext,
  useChatContext,
} from "stream-chat-react"

import { cn } from "@/lib/utils"
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
  GroupInfoSheet,
  isGroupConversation,
} from "@/features/chat/group-info-sheet"
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
import { MobilePaneContext } from "@/features/chat/mobile-pane-context"
import {
  StreamChatBoundary,
  useStreamChatStatus,
  useStreamClient,
} from "@/features/chat/stream-provider"
import { ChatProfileContext } from "@/features/chat/profile-context"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"
import { PlayerProfileDialog } from "@/features/dashboard/profile-dialog"
import { PlayerChatSearchContext } from "@/features/chat/player-chat-search-context"

export { VenueInboxContext }

/**
 * Every visual piece the SDK renders is replaced with our own component here;
 * the vendor stylesheet is NOT imported (structural layout for the SDK's
 * container divs lives in stream-provider.tsx). Slot names follow ComponentContext.
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
 * provider wraps this view; this view renders the two panes and
 * a custom header. When Stream is connecting or unavailable it falls back to
 * a centered status message instead of crashing on a missing context.
 */
export function ChatView({
  initialChannelId,
  venueInboxId,
  venueInboxBrandId,
}: {
  initialChannelId?: string
  /**
   * Set when this view is the venue operator's per-venue inbox
   * (`/app/venue/[venueId]/messages`) rather than a player's own chat —
   * scopes the channel list to that venue's chats and flips the header/row
   * rendering to the operator's perspective (see `VenueInboxContext`).
   */
  venueInboxId?: string
  /**
   * The inbox venue's brand. Player chats are one per brand (not per branch),
   * so every branch's inbox also lists the brand-tagged chats.
   */
  venueInboxBrandId?: string
}) {
  const t = useTranslations("Chat")
  const status = useStreamChatStatus()
  const client = useStreamClient()
  // Player chat uses the homepage palette; the venue operator inbox keeps the
  // neutral dashboard theme (no `venueInboxId` prop = player).
  const player = !venueInboxId
  const [searchQuery, setSearchQuery] = React.useState("")
  const searchContext = React.useMemo(
    () => ({ query: searchQuery, setQuery: setSearchQuery }),
    [searchQuery]
  )

  const [profileInitials, setProfileInitials] = React.useState<string | null>(
    null
  )
  const [profileOpen, setProfileOpen] = React.useState(false)
  const openProfile = (initials: string) => {
    setProfileInitials(initials)
    setProfileOpen(true)
  }

  // Mobile (below `sm`) collapses the two-pane layout to one at a time; a
  // deep link (`initialChannelId`) lands straight on the conversation.
  const [pane, setPane] = React.useState<"list" | "conversation">(
    initialChannelId ? "conversation" : "list"
  )
  const showList = React.useCallback(() => setPane("list"), [])
  const showConversation = React.useCallback(() => setPane("conversation"), [])
  const paneCtx = React.useMemo(
    () => ({ pane, showList, showConversation }),
    [pane, showList, showConversation]
  )

  if (!client) {
    return (
      <ChatShell player={player}>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex flex-1 items-center justify-center p-8 text-center text-sm",
              player ? "text-[var(--pc-list-muted)]" : "text-muted-foreground"
            )}
          >
            {status === "connecting" ? t("loading") : t("unavailable")}
          </div>
        </div>
      </ChatShell>
    )
  }

  const userId = client.userID as string

  const body = (
    <PlayerChatSearchContext.Provider value={searchContext}>
      <MobilePaneContext.Provider value={paneCtx}>
        <ChatProfileContext.Provider value={openProfile}>
          <WithComponents overrides={COMPONENT_OVERRIDES}>
            <aside
              className={cn(
                "min-h-0 w-full shrink-0 flex-col sm:flex sm:border-r",
                player
                  ? "bg-[var(--pc-surface)] sm:w-72 sm:border-[var(--pc-list-border)] lg:w-80 xl:w-[22rem]"
                  : "sm:w-72 sm:border-border",
                pane === "conversation" ? "hidden sm:flex" : "flex"
              )}
            >
              <ChannelList
                filters={
                  venueInboxId
                    ? {
                        type: "messaging",
                        members: { $in: [userId] },
                        ...(venueInboxBrandId
                          ? {
                              $or: [
                                { venueId: venueInboxId },
                                { brandId: venueInboxBrandId },
                              ],
                            }
                          : { venueId: venueInboxId }),
                      }
                    : { type: "messaging", members: { $in: [userId] } }
                }
                sort={{ last_message_at: -1 }}
                options={{ state: true, watch: true }}
                // Without this, the list's first load re-selects channels[0]
                // (the most recent chat), racing `InitialChannel` — a fresh
                // deep-linked chat with no messages yet (e.g. a just-opened
                // venue chat) sorts last, so the first message silently went
                // to whichever conversation was on top instead.
                customActiveChannel={initialChannelId}
                renderChannels={
                  player && searchQuery.trim()
                    ? (channels, channelPreview) => {
                        const term = normalizeSearchText(searchQuery)
                        const matches = channels.filter((channel) =>
                          [
                            channel.data?.name,
                            ...Object.values(channel.state.members ?? {}).map(
                              (member) => member.user?.name
                            ),
                          ].some((value) =>
                            normalizeSearchText(String(value ?? "")).includes(
                              term
                            )
                          )
                        )
                        return matches.length ? (
                          matches.map(channelPreview)
                        ) : (
                          <p className="px-4 py-6 text-center text-sm text-[var(--pc-list-muted)]">
                            {t("listNoResults")}
                          </p>
                        )
                      }
                    : undefined
                }
                Paginator={ChannelListPaginator}
              />
            </aside>

            {/* Active conversation. No <Window> — it only exists to coordinate
            with a Thread pane we don't render. */}
            <section
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col",
                player && "bg-[var(--pc-bg)] text-[var(--pc-ink)]",
                pane === "list" ? "hidden sm:flex" : "flex"
              )}
            >
              <ActiveConversation
                player={player}
                currentUserId={userId}
                onOpenProfile={openProfile}
              />
            </section>

            <InitialChannel id={initialChannelId} />
          </WithComponents>
          <PlayerProfileDialog
            initials={profileInitials}
            open={profileOpen}
            onOpenChange={setProfileOpen}
          />
        </ChatProfileContext.Provider>
      </MobilePaneContext.Provider>
    </PlayerChatSearchContext.Provider>
  )

  return (
    <StreamChatBoundary>
      <ChatShell player={player}>
        {venueInboxId ? (
          <VenueInboxContext.Provider value={true}>
            {body}
          </VenueInboxContext.Provider>
        ) : (
          body
        )}
      </ChatShell>
    </StreamChatBoundary>
  )
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim()
}

/** The two-pane layout the chat lives in — no card wrapper, sits directly on the dashboard background. */
function ChatShell({
  player,
  children,
}: {
  player: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden",
        player && "player-chat bg-[var(--pc-surface)] text-[var(--pc-list-ink)]"
      )}
    >
      {children}
    </div>
  )
}

/**
 * The conversation pane. With no active channel it shows the player-chat
 * invitation; otherwise it mounts the Stream `<Channel>` with our header,
 * message list and composer. Reading the active channel from `useChatContext`
 * here (not in `ChatView`) keeps the hooks unconditional.
 */
function ActiveConversation({
  player,
  currentUserId,
  onOpenProfile,
}: {
  player: boolean
  currentUserId: string
  onOpenProfile: (initials: string) => void
}) {
  const { channel } = useChatContext()
  if (!channel) return <ConversationInvite player={player} />
  return (
    <Channel>
      <TeamChannelHeader
        currentUserId={currentUserId}
        onOpenProfile={onOpenProfile}
      />
      <MessageList />
      <Composer />
    </Channel>
  )
}

/** Empty conversation pane: an invite + a small badminton asset (player only). */
function ConversationInvite({ player }: { player: boolean }) {
  const t = useTranslations("Chat")
  const { showList } = React.useContext(MobilePaneContext)
  if (!player) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t("emptyTitle")}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--pc-bg)] text-[var(--pc-ink)]">
      <div className="flex items-center gap-1 border-b border-[var(--pc-border)] p-2 sm:hidden">
        <button
          type="button"
          aria-label={t("backToChats")}
          className="grid size-11 place-items-center rounded-full text-[var(--pc-ink)] hover:bg-[var(--pc-surface-2)]"
          onClick={showList}
        >
          <ArrowLeft className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_center,#2046ed1a_0%,transparent_60%)] p-8 text-center">
        <Image
          src="/58f807168247ee67c3cc674f3c7df3619d1d9941.png"
          alt=""
          width={140}
          height={140}
          aria-hidden
          className="h-auto w-36 -rotate-6 drop-shadow-[6px_6px_0_#dbe1ff]"
        />
        <div className="space-y-1">
          <p className="font-heading text-2xl font-black text-[var(--pc-accent)]">
            {t("playerEmptyTitle")}
          </p>
          <p className="max-w-xs text-sm text-[var(--pc-muted)]">
            {t("playerEmptyHint")}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Watches `initialChannelId` and makes it the active channel on mount — used to
 * deep-link into a specific room/DM via `/app/chat?channel=<id>`. Renders
 * nothing; a missing/inaccessible channel is ignored (the list's default
 * selection stands). The ChannelList's `customActiveChannel` pins the same
 * channel once its first page loads, so whichever finishes last agrees.
 */
function InitialChannel({ id }: { id?: string }) {
  const { client, setActiveChannel } = useChatContext()
  const { showConversation, showList } = React.useContext(MobilePaneContext)

  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    const channel = client.channel("messaging", id)
    channel
      .watch()
      .then(() => {
        if (!cancelled) {
          setActiveChannel(channel)
          showConversation()
        }
      })
      .catch(() => {
        // A missing deep link must return to the list on one-pane viewports.
        if (!cancelled) showList()
      })
    return () => {
      cancelled = true
    }
  }, [id, client, setActiveChannel, showConversation, showList])

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
  const tg = useTranslations("GroupInfo")
  const { channel, members } = useChannelStateContext()
  const inbox = React.useContext(VenueInboxContext)
  const player = !inbox
  const { showList } = React.useContext(MobilePaneContext)

  const nameClass = cn(
    "truncate font-semibold",
    player && "text-[var(--pc-header-ink)]"
  )
  const subClass = cn(
    "inline-flex items-center gap-1 text-xs",
    player ? "text-[var(--pc-header-muted)]" : "text-muted-foreground"
  )

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
  const showGroupInfo =
    player && isGroupConversation(channel.id, memberList.length, venueChat)
  const [infoOpen, setInfoOpen] = React.useState(false)

  const onlineDot = player ? "bg-[var(--pc-online)]" : "bg-brand"

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3",
        player
          ? "border-[var(--pc-border)] bg-[var(--pc-header)] text-[var(--pc-header-ink)]"
          : "border-border"
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label={t("backToChats")}
          className={cn(
            "-ml-1.5 grid size-11 shrink-0 place-items-center rounded-full",
            "sm:hidden",
            player
              ? "text-[var(--pc-header-ink)] hover:bg-[var(--pc-surface-2)]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          onClick={showList}
        >
          <ArrowLeft className="size-5" />
        </button>
        {venueChat && !inbox ? (
          <div className="flex min-w-0 items-center gap-3">
            <ChatAvatar name={name} />
            <div className="min-w-0">
              <p className={nameClass}>{name}</p>
              <p className={subClass}>
                <MapPin className="size-3" />
                {t("venueChat")}
              </p>
            </div>
          </div>
        ) : isGroup || showGroupInfo ? (
          <button
            type="button"
            disabled={!showGroupInfo}
            onClick={() => setInfoOpen(true)}
            className={cn(
              "-m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent",
              player ? "hover:bg-[var(--pc-surface-2)]" : "hover:bg-muted/40"
            )}
          >
            <ChatAvatar name={name} />
            <div className="min-w-0">
              <p className={nameClass}>{name}</p>
              <p className={subClass}>
                <Users className="size-3" />
                {t("members", { count: memberList.length })}
              </p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            disabled={!otherInitials}
            className={cn(
              "-m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent",
              player ? "hover:bg-[var(--pc-surface-2)]" : "hover:bg-muted/40"
            )}
            onClick={() => otherInitials && onOpenProfile(otherInitials)}
          >
            <ChatAvatar
              name={other?.user?.name ?? name}
              image={other?.user?.image}
            >
              {other?.user?.online ? (
                <AvatarBadge className={onlineDot} />
              ) : null}
            </ChatAvatar>
            <div className="min-w-0">
              <p className={nameClass}>{other?.user?.name ?? name}</p>
              <p className={subClass}>
                {other?.user?.online ? (
                  <>
                    <span className={cn("size-1.5 rounded-full", onlineDot)} />
                    {t("online")}
                  </>
                ) : (
                  t("offline")
                )}
              </p>
            </div>
          </button>
        )}
      </div>
      {showGroupInfo ? (
        <>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label={tg("open")}
            title={tg("open")}
            className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-[#a5ff12] text-[var(--pc-accent)] transition-colors hover:bg-[#a5ff12]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pc-accent)]"
          >
            <Info className="size-5" />
          </button>
          <GroupInfoSheet
            open={infoOpen}
            onOpenChange={setInfoOpen}
            currentUserId={currentUserId}
          />
        </>
      ) : null}
    </header>
  )
}
