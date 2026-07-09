"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Phone, Search, Send, Users, Video } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type Chat, type Message } from "@/features/dashboard/data"
import { useChat } from "@/features/chat/chat-store"
import { useData } from "@/features/dashboard/data-provider"
import { PlayerProfileDialog } from "@/features/dashboard/profile-dialog"

export function ChatView() {
  const t = useTranslations("Chat")
  const tc = useTranslations("Common")
  const { chats, activeChatId, setActiveChatId, threadFor, sendMessage } =
    useChat()
  const { players } = useData()
  const [draft, setDraft] = React.useState("")
  const [profileInitials, setProfileInitials] = React.useState<string | null>(
    null
  )
  const [profileOpen, setProfileOpen] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const active = chats.find((c) => c.id === activeChatId) ?? chats[0]
  const messages = threadFor(active.id)

  const openProfileByInitials = (initials: string) => {
    setProfileInitials(initials)
    setProfileOpen(true)
  }

  const openProfileByAuthor = (authorName: string) => {
    const player = players.find(
      (p) =>
        p.name === authorName ||
        p.name.split(" ").at(-1) === authorName
    )
    if (player) {
      setProfileInitials(player.initials)
      setProfileOpen(true)
    }
  }

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [active.id, messages.length])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    sendMessage(active.id, text)
    setDraft("")
  }

  return (
    <div className="flex h-full min-h-[28rem] overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      {/* Conversation list */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border sm:flex">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <h2 className="font-heading text-base font-semibold">
            {t("messages")}
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchPlaceholder")} className="h-8 pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {chats.map((c) => (
            <ChatListItem
              key={c.id}
              chat={c}
              active={c.id === active.id}
              onSelect={() => setActiveChatId(c.id)}
              last={
                t.has(`chats.${c.id}.last`) ? t(`chats.${c.id}.last`) : c.last
              }
              time={
                t.has(`chats.${c.id}.time`) ? t(`chats.${c.id}.time`) : c.time
              }
            />
          ))}
        </div>
      </aside>

      {/* Active thread */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border p-4">
          {active.group ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                  {active.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{active.name}</p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {t("members", { count: active.members ?? 4 })}
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="-m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/40"
              onClick={() => openProfileByInitials(active.initials)}
            >
              <Avatar>
                <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                  {active.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{active.name}</p>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {active.online ? (
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
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={t("call")}>
              <Phone />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("videoCall")}>
              <Video />
            </Button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto no-scrollbar p-4"
        >
          <div className="mx-auto rounded-full bg-muted px-3 py-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {tc("when.today")}
          </div>
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              group={active.group}
              text={
                t.has(`thread.${m.id}.text`) ? t(`thread.${m.id}.text`) : m.text
              }
              time={m.time === "now" ? t("now") : m.time}
              onViewProfile={
                active.group && !m.mine ? openProfileByAuthor : undefined
              }
            />
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inputPlaceholder")}
            className="rounded-full"
            aria-label={t("messageLabel")}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 rounded-full"
            aria-label={t("send")}
            disabled={!draft.trim()}
          >
            <Send />
          </Button>
        </form>
      </section>
      <PlayerProfileDialog
        initials={profileInitials}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}

function ChatListItem({
  chat,
  active,
  onSelect,
  last,
  time,
}: {
  chat: Chat
  active: boolean
  onSelect: () => void
  last: string
  time: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl p-2.5 text-left transition-colors",
        active ? "bg-secondary" : "hover:bg-muted/60"
      )}
    >
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
            {chat.initials}
          </AvatarFallback>
        </Avatar>
        {chat.online ? (
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-brand ring-2 ring-card" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{chat.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {time}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{last}</p>
      </div>
      {chat.unread ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground tabular-nums">
          {chat.unread}
        </span>
      ) : null}
    </button>
  )
}

function MessageBubble({
  message,
  group,
  text,
  time,
  onViewProfile,
}: {
  message: Message
  group: boolean
  text: string
  time: string
  onViewProfile?: (author: string) => void
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        message.mine ? "items-end" : "items-start"
      )}
    >
      {group && !message.mine ? (
        onViewProfile ? (
          <button
            type="button"
            className="mb-0.5 rounded px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onViewProfile(message.author)}
          >
            {message.author}
          </button>
        ) : (
          <span className="mb-0.5 px-3 text-[11px] font-medium text-muted-foreground">
            {message.author}
          </span>
        )
      ) : null}
      <div
        className={cn(
          "max-w-[78%] rounded-3xl px-4 py-2 text-sm",
          message.mine
            ? "rounded-br-md bg-primary text-black"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {text}
      </div>
      <span className="mt-0.5 px-3 font-mono text-[10px] text-muted-foreground">
        {time}
      </span>
    </div>
  )
}
