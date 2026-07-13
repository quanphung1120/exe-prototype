"use client"

import * as React from "react"
import { SendHorizontal } from "lucide-react"
import {
  useChannelStateContext,
  useTranslationContext,
} from "stream-chat-react"

import { Button } from "@/components/ui/button"

/**
 * Our own message input, replacing Stream's MessageComposer. Plain-text only
 * (no attachment/emoji pickers — the quick reactions live on the messages):
 * Enter sends, Shift+Enter breaks the line, `channel.keystroke()` feeds the
 * typing indicator. Sending goes straight through `channel.sendMessage`; the
 * message appears via the channel's `message.new` event like any other.
 */
export function Composer() {
  const { channel } = useChannelStateContext("Composer")
  const { t } = useTranslationContext("Composer")
  const [text, setText] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Refocus when switching conversations (the old <MessageComposer focus />).
  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [channel.cid])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText("")
    void channel.stopTyping()
    void channel.sendMessage({ text: trimmed })
  }

  return (
    <div className="flex items-end gap-2 border-t border-border bg-card p-3">
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        placeholder={t("Type your message")}
        className="field-sizing-content max-h-32 min-w-0 flex-1 resize-none rounded-2xl bg-muted px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
        className="rounded-full"
        aria-label={t("Send")}
        disabled={!text.trim()}
        onClick={send}
      >
        <SendHorizontal />
      </Button>
    </div>
  )
}
