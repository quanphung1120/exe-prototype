"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Bell,
  CalendarCheck,
  Flame,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type NotificationItem,
  type NotificationKind,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { roomChatId, useChat } from "@/components/dashboard/chat-store"
import { useRouter } from "@/i18n/navigation"

interface NotificationsContextValue {
  items: NotificationItem[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext =
  React.createContext<NotificationsContextValue | null>(null)

export function useNotifications() {
  const ctx = React.useContext(NotificationsContext)
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider."
    )
  }
  return ctx
}

/**
 * Mock notification centre. Mounted in the dashboard layout (inside
 * MatchmakingProvider) so it can watch `joinedRooms` and push a live
 * "new team chat" notification whenever the user joins or hosts a match.
 */
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations("Notifications")
  const tm = useTranslations("MatchMaker")
  const { joinedRooms } = useMatchmaking()
  const { notifications } = useData()
  const [items, setItems] = React.useState<NotificationItem[]>(notifications)
  const seenRef = React.useRef<Set<string>>(new Set())

  React.useEffect(() => {
    const additions = joinedRooms.filter((r) => !seenRef.current.has(r.id))
    if (additions.length) {
      setItems((prev) => [
        ...additions.map((room) => {
          const title = tm.has(`rooms.${room.id}.title`)
            ? tm(`rooms.${room.id}.title`)
            : room.title
          return {
            id: `nj-${room.id}`,
            kind: "chat" as NotificationKind,
            text: t("newTeamChat", { title }),
            time: t("justNow"),
            read: false,
            href: "/dashboard/chat",
            chatId: roomChatId(room.id),
          }
        }),
        ...prev,
      ])
    }
    seenRef.current = new Set(joinedRooms.map((r) => r.id))
  }, [joinedRooms, t, tm])

  const markRead = (id: string) =>
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))

  const unreadCount = items.reduce((n, item) => n + (item.read ? 0 : 1), 0)

  const value: NotificationsContextValue = {
    items,
    unreadCount,
    markRead,
    markAllRead,
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

const kindIcon: Record<
  NotificationKind,
  React.ComponentType<{ className?: string }>
> = {
  match: Sparkles,
  chat: MessageSquare,
  booking: CalendarCheck,
  rating: TrendingUp,
  streak: Flame,
}

/** Topbar bell with an unread badge and a popover list of notifications. */
export function NotificationsButton() {
  const t = useTranslations("Notifications")
  const { items, unreadCount, markRead, markAllRead } = useNotifications()
  const { setActiveChatId } = useChat()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const onItemClick = (item: NotificationItem) => {
    markRead(item.id)
    if (item.chatId) setActiveChatId(item.chatId)
    if (item.href) router.push(item.href)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("title")}
            className="relative"
          />
        }
      >
        <Bell />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] leading-4 font-semibold text-brand-foreground tabular-nums">
            {unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t("title")}</p>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              className="rounded-full text-muted-foreground"
              onClick={markAllRead}
            >
              {t("markAllRead")}
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {items.length ? (
            items.map((item) => {
              const Icon = kindIcon[item.kind]
              const text = t.has(`items.${item.id}.text`)
                ? t(`items.${item.id}.text`)
                : item.text
              const time = t.has(`items.${item.id}.time`)
                ? t(`items.${item.id}.time`)
                : item.time
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="flex w-full items-start gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                      item.read
                        ? "bg-muted text-muted-foreground"
                        : "bg-brand/12 text-brand"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm leading-snug",
                        item.read
                          ? "text-muted-foreground"
                          : "font-medium text-foreground"
                      )}
                    >
                      {text}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                      {time}
                    </span>
                  </span>
                  {!item.read ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                  ) : null}
                </button>
              )
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
