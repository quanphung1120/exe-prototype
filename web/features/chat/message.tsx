"use client"

import * as React from "react"
import { Check, CheckCheck, SmilePlus, Trash2 } from "lucide-react"
import {
  MessageText,
  MessageTimestamp,
  isDateSeparatorMessage,
  isMessageBlocked,
  isMessageDeleted,
  isMessageEdited,
  isMessageErrorRetryable,
  useChannelStateContext,
  useMessageContext,
  useTranslationContext,
} from "stream-chat-react"
import type { Attachment as StreamAttachment } from "stream-chat"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ChatAvatar } from "@/features/chat/chat-avatar"
import { playerInitialsFromStreamId } from "@/features/chat/channel-ids"
import { useOpenChatProfile } from "@/features/chat/profile-context"

/** The quick-reaction set; types are Stream's built-in reaction types. */
const QUICK_REACTIONS = [
  { type: "like", emoji: "👍" },
  { type: "love", emoji: "❤️" },
  { type: "haha", emoji: "😂" },
  { type: "wow", emoji: "😮" },
  { type: "sad", emoji: "😢" },
]

/**
 * Fully custom Message UI, rendered by MessageList in place of Stream's
 * default (wired via `WithComponents` in ChatView). Every visual piece —
 * bubble, avatar, reactions, actions, attachments, quoted block, metadata —
 * is our own Tailwind markup; the vendor stylesheet is not imported. Only
 * MessageText (markdown/mention/translation rendering, CSS-independent via
 * `customWrapperClass`) and MessageTimestamp (a bare `<time>`) come from the
 * SDK. Hover-reveal of the action buttons is React state, not group-hover
 * CSS (see the repo's cascade-layer gotcha).
 */
export function ChatMessage() {
  const {
    groupStyles,
    handleDelete,
    handleReaction,
    handleRetry,
    isMyMessage,
    message,
    readBy,
  } = useMessageContext("ChatMessage")
  const { t } = useTranslationContext("ChatMessage")
  const { members } = useChannelStateContext("ChatMessage")
  const openProfile = useOpenChatProfile()
  const [hovered, setHovered] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  if (isDateSeparatorMessage(message) || isMessageBlocked(message)) return null

  const mine = isMyMessage()
  // The sender's roster initials, recovered from their `demo-player-*` Stream
  // id, so tapping their name/avatar can open their profile. Null (→ not
  // clickable) for my own messages or any non-roster (e.g. Clerk) user.
  const senderInitials =
    !mine && message.user?.id
      ? playerInitialsFromStreamId(message.user.id)
      : null
  const showProfile =
    senderInitials && openProfile
      ? () => openProfile(senderInitials)
      : undefined
  // Position within a run of consecutive messages from the same user; drives
  // avatar/name/metadata visibility.
  const group = groupStyles?.[0] || "single"
  const firstOfGroup = group === "top" || group === "single"
  const lastOfGroup = group === "bottom" || group === "single"
  const isGroupChannel = Object.keys(members ?? {}).length > 2
  const deleted = isMessageDeleted(message)
  const failed = message.status === "failed"
  const reactionGroups = Object.entries(message.reaction_groups ?? {}).filter(
    ([, g]) => g.count > 0
  )
  // Everyone but me who has read up to this message — drives the ✓✓ receipt.
  const readByOthers =
    readBy?.some((user) => user.id !== message.user?.id) ?? false

  return (
    <div
      className={cn(
        "flex w-full gap-2 px-1",
        mine ? "justify-end" : "justify-start",
        firstOfGroup ? "mt-3" : "mt-0.5"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "flex max-w-[75%] flex-col sm:max-w-md",
          mine ? "items-end" : "items-start"
        )}
      >
        {!mine && isGroupChannel && firstOfGroup && (
          <button
            type="button"
            disabled={!showProfile}
            onClick={showProfile}
            className="mb-0.5 ml-10 px-1 text-xs font-medium text-muted-foreground enabled:hover:text-foreground enabled:hover:underline disabled:cursor-default"
          >
            {message.user?.name}
          </button>
        )}

        {deleted ? (
          <div className="flex items-center gap-2">
            {!mine && (
              <AvatarSlot
                message={message}
                show={lastOfGroup}
                onOpenProfile={showProfile}
              />
            )}
            <div className="rounded-2xl bg-muted/60 px-3.5 py-2 text-sm text-muted-foreground italic">
              {t("Message deleted")}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2",
              mine && "flex-row-reverse"
            )}
          >
            {/* Sender avatar, centered on the bubble line; only the last
                message of a run shows it, a spacer aligns the earlier ones. */}
            {!mine && (
              <AvatarSlot
                message={message}
                show={lastOfGroup}
                onOpenProfile={showProfile}
              />
            )}
            <div
              className={cn(
                "min-w-0 rounded-3xl px-4 py-2",
                mine
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
                failed && "opacity-70",
                lastOfGroup && (mine ? "rounded-br-md" : "rounded-bl-md")
              )}
            >
              {message.quoted_message && (
                <QuotedBlock quoted={message.quoted_message} mine={mine} />
              )}
              {(message.attachments?.length ?? 0) > 0 && (
                <Attachments attachments={message.attachments ?? []} />
              )}
              <MessageText customWrapperClass="text-sm leading-relaxed break-words whitespace-pre-line [&_a]:underline" />
            </div>

            {/* Quick actions: react + delete (own). Kept in flow so revealing
                them never reflows the row; the picker keeps them visible while
                its popover is open. */}
            <div
              className={cn(
                "flex shrink-0 items-center transition-opacity",
                hovered || pickerOpen ? "opacity-100" : "opacity-0"
              )}
            >
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("React to message")}
                >
                  <SmilePlus className="size-4" />
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  className="flex w-auto gap-0.5 rounded-full px-2 py-1"
                >
                  {QUICK_REACTIONS.map(({ type, emoji }) => (
                    <button
                      key={type}
                      type="button"
                      className={cn(
                        "rounded-full p-1 text-lg leading-none transition-transform hover:scale-125",
                        message.own_reactions?.some((r) => r.type === type) &&
                          "bg-secondary"
                      )}
                      onClick={(event) => {
                        setPickerOpen(false)
                        void handleReaction(type, event)
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              {mine && (
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={t("Delete")}
                  onClick={() => {
                    void handleDelete()
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reaction pills; clicking one toggles your own reaction. */}
        {!deleted && reactionGroups.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", !mine && "ml-10")}>
            {reactionGroups.map(([type, reactionGroup]) => {
              const own = message.own_reactions?.some((r) => r.type === type)
              return (
                <button
                  key={type}
                  type="button"
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs",
                    own
                      ? "border-brand/40 bg-brand/10"
                      : "border-border bg-card hover:bg-muted"
                  )}
                  onClick={(event) => {
                    void handleReaction(type, event)
                  }}
                >
                  <span>
                    {QUICK_REACTIONS.find((r) => r.type === type)?.emoji ??
                      type}
                  </span>
                  <span className="text-muted-foreground">
                    {reactionGroup.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {failed ? (
          isMessageErrorRetryable(message) ? (
            <button
              type="button"
              className="mt-0.5 px-1 text-[11px] text-destructive hover:underline"
              onClick={() => {
                void handleRetry(message)
              }}
            >
              {t("Message failed to send")}
            </button>
          ) : (
            <span className="mt-0.5 px-1 text-[11px] text-destructive">
              {t("Message failed to send")}
            </span>
          )
        ) : (
          lastOfGroup &&
          !deleted && (
            <div className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
              {/* Delivery receipt, WhatsApp-style: ✓ delivered, ✓✓ read. */}
              {mine &&
                (readByOthers ? (
                  <CheckCheck className="size-3.5 text-brand" />
                ) : (
                  <Check
                    className={cn(
                      "size-3.5",
                      message.status === "sending" && "opacity-50"
                    )}
                  />
                ))}
              <MessageTimestamp customClass="text-[11px] text-muted-foreground" />
              {isMessageEdited(message) && <span>· {t("Edited")}</span>}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * Sender avatar sized to the bubble row; when `show` is false (not the last
 * message of a run) an equal-width spacer keeps the bubbles aligned. When
 * `onOpenProfile` is given the avatar is a button that opens the sender's
 * profile.
 */
function AvatarSlot({
  message,
  show,
  onOpenProfile,
}: {
  message: ReturnType<typeof useMessageContext>["message"]
  show: boolean
  onOpenProfile?: () => void
}) {
  if (!show) return <div className="w-8 shrink-0" />
  const avatar = (
    <ChatAvatar
      name={message.user?.name ?? "?"}
      image={message.user?.image}
      className="size-8 shrink-0"
      fallbackClassName="text-[10px]"
    />
  )
  if (!onOpenProfile) return avatar
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      aria-label={message.user?.name}
      className="rounded-full transition-opacity hover:opacity-80"
    >
      {avatar}
    </button>
  )
}

/** The quoted message a reply points at, shown inside the bubble. */
function QuotedBlock({
  quoted,
  mine,
}: {
  quoted: NonNullable<
    ReturnType<typeof useMessageContext>["message"]["quoted_message"]
  >
  mine: boolean
}) {
  return (
    <div
      className={cn(
        "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
        mine
          ? "border-primary-foreground/40 bg-primary-foreground/10"
          : "border-brand/50 bg-background/60"
      )}
    >
      <p className="font-medium">{quoted.user?.name}</p>
      <p className="line-clamp-2 opacity-80">{quoted.text}</p>
    </div>
  )
}

/** Minimal attachment rendering: inline images, everything else a file link. */
function Attachments({ attachments }: { attachments: StreamAttachment[] }) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      {attachments.map((attachment, i) => {
        const imageUrl =
          attachment.type === "image"
            ? (attachment.image_url ?? attachment.thumb_url)
            : undefined
        if (imageUrl) {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- remote Stream CDN uploads, dimensions unknown
            <img
              key={i}
              src={imageUrl}
              alt={attachment.fallback ?? ""}
              className="max-h-60 rounded-lg object-cover"
            />
          )
        }
        const fileUrl = attachment.asset_url ?? attachment.og_scrape_url
        if (!fileUrl) return null
        return (
          <a
            key={i}
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs underline"
          >
            {attachment.title ?? fileUrl}
          </a>
        )
      })}
    </div>
  )
}
