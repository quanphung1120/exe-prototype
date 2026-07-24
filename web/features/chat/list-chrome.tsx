"use client"

import type * as React from "react"
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
  return (
    <div
      className={cn(
        "flex justify-center",
        floating
          ? "pointer-events-none absolute inset-x-0 top-2 z-10"
          : "my-3"
      )}
    >
      <span
        className={cn(
          "rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground",
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

  const names = Object.values(typing)
    .filter((event) => event.user?.id !== client.userID)
    .map((event) => event.user?.name ?? event.user?.id)
    .filter(Boolean)
  const { t } = useTranslationContext("ChatTypingIndicator")

  if (!isMessageListScrolledToBottom || names.length === 0) return null
  return (
    <p className="px-4 pb-1 text-xs text-muted-foreground italic">
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
  return (
    <div className="my-2 flex items-center gap-3 px-2">
      <span className="h-px flex-1 bg-brand/40" />
      <span className="text-[11px] font-medium text-brand">
        {t("Unread messages")}
        {showCount && unreadCount ? ` (${unreadCount})` : ""}
      </span>
      <span className="h-px flex-1 bg-brand/40" />
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
  return (
    <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
      <button
        type="button"
        className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-md hover:opacity-90"
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
  if (isMessageListScrolledToBottom && !isNotAtLatestMessageSet) return null
  return (
    <div className="absolute right-4 bottom-3 z-10">
      <button
        type="button"
        aria-label="Scroll to latest message"
        className="flex size-9 items-center justify-center rounded-full bg-card text-foreground shadow-md ring-1 ring-foreground/10 hover:bg-muted"
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
        <MessagesSquare className="size-6" />
      </div>
      <p className="text-sm text-muted-foreground">
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
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
  )
}

/** Spinner used by the list while paginating. */
export function ChatLoadingIndicator() {
  return (
    <div className="flex justify-center p-3">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  )
}
