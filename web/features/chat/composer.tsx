"use client"

import * as React from "react"
import { SendHorizontal } from "lucide-react"
import { toast } from "sonner"
import {
  useChannelStateContext,
  useTranslationContext,
} from "stream-chat-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { VenueInboxContext } from "@/features/chat/venue-inbox-context"

/**
 * Whether `channel` is frozen (host cancelled the room / venue cancelled the
 * booking — quyết định #13), kept live via `useSyncExternalStore` rather than
 * an effect + setState: the Stream `Channel` instance is a mutable object the
 * context hands us, and `channel.updated` events push straight onto it, so
 * subscribing is enough — no derived-state render to schedule.
 */
function useFrozen(
  channel: ReturnType<typeof useChannelStateContext>["channel"]
) {
  return React.useSyncExternalStore(
    (onChange) => {
      const handler = () => onChange()
      channel.on("channel.updated", handler)
      return () => channel.off("channel.updated", handler)
    },
    () => Boolean(channel.data?.frozen)
  )
}

/**
 * Our own message input, replacing Stream's MessageComposer. Plain-text only
 * (no attachment/emoji pickers — the quick reactions live on the messages):
 * Enter sends, Shift+Enter breaks the line, `channel.keystroke()` feeds the
 * typing indicator. Sending goes straight through `channel.sendMessage`; the
 * message appears via the channel's `message.new` event like any other. A
 * frozen room (host cancelled) disables input entirely.
 */
export function Composer() {
  const { channel } = useChannelStateContext("Composer")
  const { t } = useTranslationContext("Composer")
  const [text, setText] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const frozen = useFrozen(channel)
  // Player chat uses the homepage's lime search-pill language.
  const player = !React.useContext(VenueInboxContext)

  // Refocus when switching conversations (the old <MessageComposer focus />).
  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [channel.cid])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || frozen) return
    setText("")
    void channel.stopTyping()
    void (async () => {
      try {
        // A chat that was just opened (e.g. a first message to a venue) may
        // not be watched yet — watch it so the send and its `message.new`
        // event are both delivered to this client.
        if (!channel.state.messages.length) await channel.watch()
        await channel.sendMessage({ text: trimmed })
      } catch (err) {
        // Never lose the text silently: put it back and say why.
        setText((current) => current || trimmed)
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("Error sending message")
        )
      }
    })()
  }

  if (frozen) {
    return (
      <div
        className={cn(
          "border-t p-3 text-center text-sm",
          player
            ? "border-[var(--pc-list-border)] bg-[var(--pc-surface)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[var(--pc-list-muted)]"
            : "border-border text-muted-foreground"
        )}
      >
        {t("This room has ended")}
      </div>
    )
  }

  const input = (
    <>
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder={t("Type your message")}
        className={cn(
          "field-sizing-content max-h-32 min-w-0 flex-1 resize-none px-3.5 py-2 text-sm outline-none focus-visible:ring-2",
          player
            ? "rounded-full bg-transparent font-medium text-[var(--pc-ink)] placeholder:text-[var(--pc-muted)] focus-visible:ring-[var(--pc-blue)]"
            : "rounded-2xl bg-muted placeholder:text-muted-foreground focus-visible:ring-ring"
        )}
        onChange={(event) => {
          setText(event.target.value)
          void channel.keystroke()
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
      />
      <Button
        size="icon"
        className={cn(
          "rounded-full",
          player &&
            "size-11 shrink-0 bg-[var(--pc-blue)] text-white hover:bg-[#173bc8]"
        )}
        aria-label={t("Send")}
        disabled={!text.trim()}
        onClick={send}
      >
        <SendHorizontal />
      </Button>
    </>
  )

  return (
    <div
      className={cn(
        player
          ? "border-t border-[var(--pc-list-border)] bg-[var(--pc-surface)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5"
          : "flex items-end gap-2 border-t border-border p-3"
      )}
    >
      {player ? (
        <div className="flex items-end gap-2 rounded-[30px] border border-[var(--pc-border)] bg-white p-1.5">
          {input}
        </div>
      ) : (
        input
      )}
    </div>
  )
}
