"use client"

import * as React from "react"
import type { PropsWithChildren } from "react"
import { useLocale } from "next-intl"
import { Loader2 } from "lucide-react"
import type {
  ChannelListItemUIProps,
  ChannelListUIProps,
  LoadMorePaginatorProps,
} from "stream-chat-react"
import { useTranslationContext } from "stream-chat-react"

import { initialsOf } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"

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
  const title = displayTitle ?? channel.data?.name ?? channel.id
  const hasUnread = (unread ?? 0) > 0

  return (
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
      }}
    >
      <Avatar className="size-10 shrink-0">
        <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
          {initialsOf(title ?? "?")}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate text-sm", hasUnread && "font-semibold")}>
            {title}
          </p>
          {lastMessage?.created_at && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
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
  )
}

/** Pane header above the conversation rows, replacing Stream's bare title. */
export function ChannelListHeader() {
  const { t } = useTranslationContext("ChannelListHeader")
  return (
    <header className="border-b border-border p-4">
      <h2 className="font-heading text-sm font-semibold">{t("Chats")}</h2>
    </header>
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
    <div role="listbox" className="flex flex-col gap-0.5 overflow-y-auto p-2">
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
