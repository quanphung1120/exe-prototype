"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import { ArrowDown, Loader2, MessagesSquare } from "lucide-react"
import type {
  DateSeparatorProps,
  EmptyStateIndicatorProps,
  EventComponentProps,
  ScrollToLatestMessageButtonProps,
  TypingIndicatorProps,
  UnreadMessagesNotificationProps,
  UnreadMessagesSeparatorProps,
} from "stream-chat-react"
import {
  useChannelActionContext,
  useChatContext,
  useTranslationContext,
  useTypingContext,
} from "stream-chat-react"

import { cn } from "@/lib/utils"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"

/**
 * Custom replacements for MessageList's chrome (wired via WithComponents in
 * ChatView) — the vendor stylesheet is not imported, so every visible piece
 * the list renders around our ChatMessage needs an owned counterpart.
 */

/**
 * Centered date pill between message groups. With `floating` (rendered by the
 * SDK's FloatingDateSeparator while scrolling) it pins to the top of the
 * message panel instead of sitting in flow.
 */
export function ChatDateSeparator({ date, floating }: DateSeparatorProps) {
  const locale = useLocale()
  const player = !React.useContext(VenueInboxContext)
  return (
    <div
      className={cn(
        "flex justify-center",
        floating ? "pointer-events-none absolute inset-x-0 top-2 z-10" : "my-3"
      )}
    >
      <span
        className={cn(
          "rounded-full px-3 py-0.5 text-[11px] font-medium",
          player
            ? "bg-[var(--pc-surface-2)] text-[var(--pc-muted)]"
            : "bg-muted text-muted-foreground",
          floating && "shadow-sm ring-1 ring-foreground/5"
        )}
      >
        {new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "long",
          ...(date.getFullYear() !== new Date().getFullYear() && {
            year: "numeric",
          }),
        }).format(date)}
      </span>
    </div>
  )
}

/** System/event messages ("X was added to the room", …) as a muted line. */
export function ChatSystemMessage({ message }: EventComponentProps) {
  if (!message.text) return null
  return (
    <p className="my-2 text-center text-[11px] text-muted-foreground">
      {message.text}
    </p>
  )
}

/** "X is typing…" line pinned under the last message. */
export function ChatTypingIndicator({
  isMessageListScrolledToBottom = true,
}: TypingIndicatorProps) {
  const { client } = useChatContext("ChatTypingIndicator")
  const { typing = {} } = useTypingContext("ChatTypingIndicator") ?? {}
  const player = !React.useContext(VenueInboxContext)

  const names = Object.values(typing)
    .filter((event) => event.user?.id !== client.userID)
    .map((event) => event.user?.name ?? event.user?.id)
    .filter(Boolean)
  const { t } = useTranslationContext("ChatTypingIndicator")

  if (!isMessageListScrolledToBottom || names.length === 0) return null
  return (
    <p
      className={cn(
        "px-4 pb-1 text-xs italic",
        player ? "text-[var(--pc-muted)]" : "text-muted-foreground"
      )}
    >
      {names.length === 1
        ? t("{{ user }} is typing...", { user: names[0] })
        : t("{{ users }} and more are typing...", {
            users: names.slice(0, 2).join(", "),
          })}
    </p>
  )
}

/** Divider marking where unread messages start. */
export function ChatUnreadSeparator({
  showCount = true,
  unreadCount,
}: UnreadMessagesSeparatorProps) {
  const { t } = useTranslationContext("ChatUnreadSeparator")
  const player = !React.useContext(VenueInboxContext)
  return (
    <div className="my-2 flex items-center gap-3 px-2">
      <span
        className={cn(
          "h-px flex-1",
          player ? "bg-[var(--pc-accent-soft-strong)]" : "bg-brand/40"
        )}
      />
      <span
        className={cn(
          "text-[11px] font-medium",
          player ? "text-[var(--pc-accent-strong)]" : "text-brand"
        )}
      >
        {t("Unread messages")}
        {showCount && unreadCount ? ` (${unreadCount})` : ""}
      </span>
      <span
        className={cn(
          "h-px flex-1",
          player ? "bg-[var(--pc-accent-soft-strong)]" : "bg-brand/40"
        )}
      />
    </div>
  )
}

/** Banner offering to jump to the first unread message. */
export function ChatUnreadNotification({
  queryMessageLimit,
  showCount = true,
  unreadCount,
}: UnreadMessagesNotificationProps) {
  const { jumpToFirstUnreadMessage } = useChannelActionContext(
    "ChatUnreadNotification"
  )
  const { t } = useTranslationContext("ChatUnreadNotification")
  const player = !React.useContext(VenueInboxContext)
  return (
    <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
      <button
        type="button"
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium shadow-md hover:opacity-90",
          player
            ? "bg-[var(--pc-accent)] text-[var(--pc-accent-ink)]"
            : "bg-primary text-primary-foreground"
        )}
        onClick={() => {
          void jumpToFirstUnreadMessage(queryMessageLimit)
        }}
      >
        {t("Unread messages")}
        {showCount && unreadCount ? ` (${unreadCount})` : ""}
      </button>
    </div>
  )
}

/** Floating jump-to-latest button when scrolled up. */
export function ChatScrollToBottom({
  isMessageListScrolledToBottom,
  isNotAtLatestMessageSet,
  onClick,
}: ScrollToLatestMessageButtonProps) {
  const player = !React.useContext(VenueInboxContext)
  if (isMessageListScrolledToBottom && !isNotAtLatestMessageSet) return null
  return (
    <div className="absolute right-4 bottom-3 z-10">
      <button
        type="button"
        aria-label="Scroll to latest message"
        className={cn(
          "flex size-9 items-center justify-center rounded-full shadow-md ring-1",
          player
            ? "bg-[var(--pc-blue)] text-white ring-[var(--pc-blue)] hover:bg-[#173bc8]"
            : "bg-card text-foreground ring-foreground/10 hover:bg-muted"
        )}
        onClick={onClick}
      >
        <ArrowDown className="size-4" />
      </button>
    </div>
  )
}

/** Empty message list / no channels. */
export function ChatEmptyState({ listType }: EmptyStateIndicatorProps) {
  const { t } = useTranslationContext("ChatEmptyState")
  const player = !React.useContext(VenueInboxContext)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          player
            ? "bg-[var(--pc-accent-soft)] text-[var(--pc-accent-strong)]"
            : "bg-brand/10 text-brand"
        )}
      >
        <MessagesSquare className="size-6" />
      </div>
      <p
        className={cn(
          "text-sm",
          player ? "text-[var(--pc-muted)]" : "text-muted-foreground"
        )}
      >
        {listType === "channel"
          ? t("You have no channels currently")
          : t("Nothing yet...")}
      </p>
    </div>
  )
}

/**
 * MessageList's root panel. `relative` anchors the floating date pill, the
 * unread banner and the scroll-to-bottom button; flex-1 makes the list fill
 * the space between header and composer.
 */
export function ChatMessagePanel({ children }: React.PropsWithChildren) {
  return <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
}

/** Spinner used by the list while paginating. */
export function ChatLoadingIndicator() {
  const player = !React.useContext(VenueInboxContext)
  return (
    <div className="flex justify-center p-3">
      <Loader2
        className={cn(
          "size-4 animate-spin",
          player ? "text-[var(--pc-muted)]" : "text-muted-foreground"
        )}
      />
    </div>
  )
}
