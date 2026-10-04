"use client"

import * as React from "react"
import type { PropsWithChildren } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Loader2,
  LogOut,
  MessageSquarePlus,
  MoreVertical,
  Search,
  Trash2,
} from "lucide-react"
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
import { Spinner } from "@/components/ui/spinner"
import { ChatAvatar } from "@/features/chat/chat-avatar"
import { NewChatDialog } from "@/features/chat/new-chat-dialog"
import { leaveConversation } from "@/features/chat/stream-actions"
import { MobilePaneContext } from "@/features/chat/mobile-pane-context"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"
import { usePlayerChatSearch } from "@/features/chat/player-chat-search-context"

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
  const player = !inbox
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
  // operator's /app/venue/[venueId]/messages view).
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
          "flex w-full items-center gap-3 rounded-[22px] p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
          player
            ? active
              ? "bg-[var(--pc-accent-soft)] text-[var(--pc-accent-strong)] focus-visible:outline-[var(--pc-accent)]"
              : "text-[var(--pc-list-ink)] hover:translate-x-1 hover:bg-[var(--pc-list-hover)] focus-visible:outline-[var(--pc-accent)]"
            : active
              ? "bg-secondary/60"
              : "hover:bg-muted/40"
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
          {avatarUser?.online ? (
            <AvatarBadge
              className={player ? "bg-[var(--pc-online)]" : "bg-brand"}
            />
          ) : null}
        </ChatAvatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm",
                hasUnread && "font-semibold",
                player &&
                  (active
                    ? "text-[var(--pc-accent-strong)]"
                    : "text-[var(--pc-list-ink)]")
              )}
            >
              {title}
            </p>
            {lastMessage?.created_at && (
              <span
                className={cn(
                  "shrink-0 text-[11px]",
                  player
                    ? active
                      ? "text-[var(--pc-accent-strong)]/70"
                      : "text-[var(--pc-list-muted)]"
                    : "text-muted-foreground",
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
                "truncate text-xs [&_p]:inline",
                player
                  ? active
                    ? "text-[var(--pc-accent-strong)]/80"
                    : hasUnread
                      ? "font-medium text-[var(--pc-list-ink)]"
                      : "text-[var(--pc-list-muted)]"
                  : hasUnread
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {latestMessagePreview}
            </div>
            {hasUnread && (
              <span
                className={cn(
                  "flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  player
                    ? "bg-[var(--pc-blue)] text-white"
                    : "bg-brand text-brand-foreground"
                )}
              >
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
  const player = !React.useContext(VenueInboxContext)
  const active = activeChannel?.cid === channel.cid
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
            "absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:opacity-100 focus-visible:outline-none data-popup-open:opacity-100",
            player
              ? cn(
                  active
                    ? "text-[var(--pc-accent-strong)]"
                    : "text-[var(--pc-list-muted)]",
                  "hover:bg-[var(--pc-blue)] hover:text-white data-popup-open:bg-[var(--pc-blue)]"
                )
              : "text-muted-foreground hover:bg-background/80 hover:text-foreground data-popup-open:bg-background/80",
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
 * Player chat list header: the "Chat" title plus the single "New chat" CTA that
 * opens `NewChatDialog`. The operator's venue inbox hides it — that page owns
 * its own heading — via `VenueInboxContext`.
 */
export function ChannelListHeader() {
  const inbox = React.useContext(VenueInboxContext)
  const { query, setQuery } = usePlayerChatSearch()
  const t = useTranslations("Chat")
  const [dialogOpen, setDialogOpen] = React.useState(false)

  if (inbox) return null

  return (
    <div className="border-b border-[var(--pc-list-border)] px-4 pt-5 pb-4 sm:px-5">
      <div className="flex flex-col gap-3">
        <h2 className="truncate font-heading text-2xl font-black tracking-tight text-[var(--pc-list-ink)]">
          {t("metaTitle")}
        </h2>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full rounded-full bg-[#a5ff12] px-4 font-bold text-[#173bc8] shadow-[3px_3px_0_var(--pc-pink)] transition-transform hover:-translate-y-0.5 hover:brightness-95"
          onClick={() => setDialogOpen(true)}
        >
          <MessageSquarePlus className="size-4" />
          <span>{t("newChat")}</span>
        </Button>
      </div>
      <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-[var(--pc-list-border)] bg-[var(--pc-surface-2)] px-4 text-[var(--pc-list-muted)] transition-colors focus-within:border-[var(--pc-accent)]">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="sr-only">{t("listSearchPlaceholder")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("listSearchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--pc-list-ink)] outline-none placeholder:text-[var(--pc-list-muted)]"
        />
      </label>
      <NewChatDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
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
  const inbox = React.useContext(VenueInboxContext)
  const player = !inbox

  if (error) {
    return (
      <p
        className={cn(
          "p-4 text-center text-xs",
          player ? "text-[var(--pc-list-muted)]" : "text-muted-foreground"
        )}
      >
        {t("Error loading channels")}
      </p>
    )
  }
  if (loading) {
    return (
      <div
        role="status"
        className={cn(
          "grid place-items-center p-8",
          player && "flex-1 bg-[var(--pc-surface)]"
        )}
      >
        <Spinner />
      </div>
    )
  }
  return (
    <div
      role="listbox"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2",
        player && "bg-[var(--pc-surface)]"
      )}
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
  const player = !React.useContext(VenueInboxContext)

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
            <Loader2
              className={cn(
                "size-4 animate-spin",
                player ? "text-[var(--pc-list-muted)]" : "text-muted-foreground"
              )}
            />
          )}
        </div>
      )}
    </>
  )
}

/** Today → HH:mm; this week → weekday; older → short date. */
export function formatListTimestamp(date: Date, locale: string): string {
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
