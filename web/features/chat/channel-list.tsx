"use client"

import * as React from "react"
import type { PropsWithChildren } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, LogOut, MoreVertical, Trash2 } from "lucide-react"
import type { Channel } from "stream-chat"
import type {
  ChannelListItemUIProps,
  ChannelListUIProps,
  LoadMorePaginatorProps,
} from "stream-chat-react"
import { useChatContext, useTranslationContext } from "stream-chat-react"

import { cn } from "@/lib/utils"
import { AvatarBadge } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { ChatAvatar } from "@/features/chat/chat-avatar"
import { leaveConversation } from "@/features/chat/stream-actions"
import { MobilePaneContext } from "@/features/chat/mobile-pane-context"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"

/**
 * Custom conversation-list row, replacing Stream's ChannelListItemUI (wired
 * via WithComponents). The ChannelList/ChannelListItem logic wrappers still do
 * the querying, event handling and preview computation — we only render.
 */
export function ChannelListItem({
  active,
  channel,
  displayTitle,
  lastMessage,
  latestMessagePreview,
  onSelect,
  setActiveChannel,
  unread,
  watchers,
}: ChannelListItemUIProps) {
  const locale = useLocale()
  const { client } = useChatContext()
  const inbox = React.useContext(VenueInboxContext)
  const { showConversation } = React.useContext(MobilePaneContext)

  const members = Object.values(channel.state.members ?? {})
  const other = members.find((m) => m.user?.id !== client.userID)
  const isGroup = members.length > 2
  // Player-side venue chats are titled/avatared as the venue, not the
  // owner's personal account; operator inbox rows show the player.
  const isVenueChat = Boolean(channel.data?.venueId)
  const avatarUser =
    !isGroup && (inbox || !isVenueChat) ? other?.user : undefined

  // Operator's venue inbox: title each row by the *player* on the other end,
  // not the venue's own name (every row in this list is already scoped to
  // one venue). Player-side rows are unaffected (channel.data?.venueId is
  // only set on venue-chat channels, and `inbox` is only true in the
  // operator's /dashboard/venue/[venueId]/messages view).
  const venueChatOther = inbox && isVenueChat ? other : undefined

  const title =
    venueChatOther?.user?.name ??
    displayTitle ??
    channel.data?.name ??
    channel.id
  const hasUnread = (unread ?? 0) > 0

  // Room chats (`room-*`) have their own leave flow tied to the room's real
  // membership (features/rooms) — don't offer the generic remove here, or the
  // chat channel and the room record could drift apart. Everything else (DMs,
  // groups, venue chats) can be removed from the list.
  const canRemove = !String(channel.id ?? "").startsWith("room-")

  return (
    <div className="group/row relative">
      <button
        type="button"
        role="option"
        aria-selected={active}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
          active ? "bg-secondary/60" : "hover:bg-muted/40"
        )}
        onClick={(event) => {
          if (onSelect) onSelect(event)
          else setActiveChannel?.(channel, watchers)
          showConversation()
        }}
      >
        <ChatAvatar
          name={avatarUser?.name ?? title ?? "?"}
          image={avatarUser?.image}
          className="size-10 shrink-0"
        >
          {avatarUser?.online ? <AvatarBadge className="bg-brand" /> : null}
        </ChatAvatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-sm", hasUnread && "font-semibold")}>
              {title}
            </p>
            {lastMessage?.created_at && (
              <span
                className={cn(
                  "shrink-0 text-[11px] text-muted-foreground",
                  // Make room for the hover menu so the two never overlap.
                  canRemove && "sm:group-hover/row:opacity-0"
                )}
              >
                {formatListTimestamp(lastMessage.created_at, locale)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            {/* div, not p: the SDK renders the preview through Markdown, which
                emits its own <p>. Inline it so truncate can ellipsize. */}
            <div
              className={cn(
                "truncate text-xs text-muted-foreground [&_p]:inline",
                hasUnread && "font-medium text-foreground"
              )}
            >
              {latestMessagePreview}
            </div>
            {hasUnread && (
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground">
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
      {canRemove && (
        <ChannelRowMenu channel={channel} title={title} isGroup={isGroup} />
      )}
    </div>
  )
}

/**
 * Per-row overflow menu to remove a conversation from the list. A group is
 * *left* (others keep it); a DM/venue chat is *deleted for me* (hidden, my
 * history cleared) — the api picks which from membership. The trigger is a
 * sibling of the row's select button (never nested — invalid HTML) and shows
 * on hover/focus, or always on touch where there's no hover.
 */
function ChannelRowMenu({
  channel,
  title,
  isGroup,
}: {
  channel: Channel
  title?: string
  isGroup: boolean
}) {
  const t = useTranslations("Chat")
  const name = title ?? t("metaTitle")
  const { channel: activeChannel, setActiveChannel } = useChatContext()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await leaveConversation(channel.id as string)
    } catch {
      toast.error(t("removeFailed"))
      setPending(false)
      return
    }
    // If the removed conversation was the open one, clear the pane — its
    // channel.hidden / removed_from_channel event also drops it from the list.
    if (activeChannel?.cid === channel.cid) setActiveChannel(undefined)
    setPending(false)
    setConfirmOpen(false)
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label={t("rowMenuLabel")}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none data-popup-open:bg-background/80 data-popup-open:opacity-100",
            "opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100"
          )}
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            {isGroup ? (
              <>
                <LogOut />
                {t("leaveGroup")}
              </>
            ) : (
              <>
                <Trash2 />
                {t("deleteDm")}
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isGroup ? t("leaveGroupTitle") : t("deleteDmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isGroup
                ? t("leaveGroupDescription", { name })
                : t("deleteDmDescription", { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {isGroup ? t("leaving") : t("deleting")}
                </>
              ) : isGroup ? (
                t("leaveGroup")
              ) : (
                t("deleteDm")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * No-op override for Stream's ChannelListUI header slot: the "Chats" title
 * duplicated the dashboard topbar's page title, and the new-chat button now
 * lives there too (see `NewChatAction` in features/dashboard/section-actions).
 * Kept as an explicit override (rather than omitted) so WithComponents
 * doesn't fall back to Stream's own default header.
 */
export function ChannelListHeader() {
  return null
}

/**
 * The list container, replacing Stream's ChannelListUI: our own loading
 * skeleton and error state around the rows the ChannelList logic renders.
 */
export function ChannelListShell({
  children,
  error,
  loading,
}: PropsWithChildren<ChannelListUIProps>) {
  const { t } = useTranslationContext("ChannelListShell")

  if (error) {
    return (
      <p className="p-4 text-center text-xs text-muted-foreground">
        {t("Error loading channels")}
      </p>
    )
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div
      role="listbox"
      className="no-scrollbar flex flex-col gap-0.5 overflow-y-auto p-2"
    >
      {children}
    </div>
  )
}

/**
 * Lazy-loading channel paginator, replacing Stream's default LoadMorePaginator
 * (a "Load more" button). A zero-height sentinel is watched with an
 * IntersectionObserver rooted at the scrolling ChannelListShell; when it scrolls
 * into view the next page is fetched, so older conversations stream in as the
 * user scrolls instead of on a click. `isLoading` gates re-triggering during an
 * in-flight query, and the observer re-arms when it clears so a still-visible
 * sentinel keeps filling the pane until there are no more pages.
 */
export function ChannelListPaginator({
  children,
  hasNextPage,
  isLoading,
  loadNextPage,
}: PropsWithChildren<LoadMorePaginatorProps>) {
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage || isLoading) return
    // The sentinel is a direct child of ChannelListShell's scrolling listbox,
    // so its parent is the correct IntersectionObserver root.
    const root = sentinel.parentElement
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage()
      },
      { root, rootMargin: "160px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isLoading, loadNextPage])

  return (
    <>
      {children}
      {hasNextPage && (
        <div
          ref={sentinelRef}
          className="flex justify-center py-2"
          aria-hidden={!isLoading}
        >
          {isLoading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </>
  )
}

/** Today → HH:mm; this week → weekday; older → short date. */
function formatListTimestamp(date: Date, locale: string): string {
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }
  const withinWeek = now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000
  if (withinWeek) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
  }).format(date)
}
