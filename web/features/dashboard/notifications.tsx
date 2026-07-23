"use client"

import * as React from "react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
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
  type NotificationRecord,
} from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/dashboard/notification-actions"
import { useMatchmaking } from "@/features/play/matchmaking"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { demoChannelId, roomChannelId } from "@/features/chat/channel-ids"
import { useRouter } from "@/i18n/navigation"

/** How often the notification centre polls `GET /api/notifications`. */
const POLL_MS = 30_000

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
 * Notification centre. Mounted in the dashboard layout (inside
 * MatchmakingProvider) so it can watch `joinedRooms` and push a live
 * "new team chat" notification whenever the user joins or hosts a match, and
 * poll the Phase 7 transactional feed (`GET /api/notifications`) for
 * server-delivered ones (an operator's approve/decline, an auto-confirm, a
 * no-show mark, …). The static seed (`useData().notifications`) is only the
 * base/demo items — every dynamic notification arrives via the poll.
 */
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations("Notifications")
  const tm = useTranslations("MatchMaker")
  const format = useFormatter()
  const { joinedRooms, expiredEvents } = useMatchmaking()
  const { notifications } = useData()
  const [items, setItems] = React.useState<NotificationItem[]>(notifications)
  const seenRef = React.useRef<Set<string>>(new Set())
  const seenExpiredRef = React.useRef<Set<string>>(new Set())
  // The server-notification ids already merged into `items`, so a poll only
  // toasts genuinely new ones. Starts empty (not the seed's ids — server ids
  // never collide with the seed's `n1…n4`) and is filled by the first poll,
  // which never toasts (a fresh mount shouldn't replay every unread item that
  // arrived while the user was away as a toast storm).
  const seenServerRef = React.useRef<Set<string>>(new Set())
  const firstPollRef = React.useRef(true)

  // Merge a fresh `GET /api/notifications` response into `items` by id —
  // server records win over any stale copy already shown. `time` is
  // recomputed as a relative string from `createdAt` on every poll (next-intl
  // localizes it — "5 phút trước" in vi, "5 minutes ago" in en — for free).
  const mergeServer = React.useCallback(
    (records: NotificationRecord[]) => {
      const now = new Date()
      setItems((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p] as const))
        for (const r of records) {
          // `createdAt` should always be a valid ISO string, but guard against a
          // missing/malformed one: `format.relativeTime` on an Invalid Date
          // passes NaN to `Intl.RelativeTimeFormat.format`, which throws (logged
          // as a console error). Fall back to any time we already showed.
          const created = new Date(r.createdAt)
          const time = Number.isNaN(created.getTime())
            ? (byId.get(r.id)?.time ?? "")
            : format.relativeTime(created, now)
          byId.set(r.id, {
            id: r.id,
            kind: r.kind,
            text: r.text,
            href: r.href,
            read: r.read,
            time,
            createdAt: r.createdAt,
          })
        }
        const serverIds = new Set(records.map((r) => r.id))
        return [
          ...records.map((r) => byId.get(r.id)!),
          ...prev.filter((p) => !serverIds.has(p.id)),
        ]
      })
      if (!firstPollRef.current) {
        for (const r of records) {
          if (!r.read && !seenServerRef.current.has(r.id)) toast(r.text)
        }
      }
      firstPollRef.current = false
      seenServerRef.current = new Set(records.map((r) => r.id))
    },
    [format]
  )

  React.useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const records = await listNotifications()
        if (!cancelled) mergeServer(records)
      } catch {
        // Transient poll failure (offline, API blip) — the next tick retries.
      }
    }
    void poll()
    const interval = setInterval(() => void poll(), POLL_MS)
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") void poll()
    }
    document.addEventListener("visibilitychange", onFocusOrVisible)
    window.addEventListener("focus", onFocusOrVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onFocusOrVisible)
      window.removeEventListener("focus", onFocusOrVisible)
    }
  }, [mergeServer])

  React.useEffect(() => {
    const additions = joinedRooms.filter((r) => !seenRef.current.has(r.id))
    if (additions.length) {
      setItems((prev) => [
        ...additions.map((room): NotificationItem => {
          const title = tm.has(`rooms.${room.id}.title`)
            ? tm(`rooms.${room.id}.title`)
            : room.title
          return {
            id: `nj-${room.id}`,
            kind: "chat",
            text: t("newTeamChat", { title }),
            time: t("justNow"),
            read: false,
            href: "/dashboard/chat",
            chatId: roomChannelId(room.id),
          }
        }),
        ...prev,
      ])
    }
    seenRef.current = new Set(joinedRooms.map((r) => r.id))
  }, [joinedRooms, t, tm])

  React.useEffect(() => {
    const additions = expiredEvents.filter(
      (e) => !seenExpiredRef.current.has(e.id)
    )
    if (additions.length) {
      setItems((prev) => [
        ...additions.map((e): NotificationItem => ({
          id: e.id,
          kind: e.kind === "hold" ? "booking" : "match",
          text:
            e.kind === "hold"
              ? t("holdExpired", { title: e.title })
              : e.kind === "request"
                ? t("requestExpired", { name: e.title })
                : t("inviteExpired", { name: e.title }),
          time: t("justNow"),
          read: false,
        })),
        ...prev,
      ])
    }
    seenExpiredRef.current = new Set(expiredEvents.map((e) => e.id))
  }, [expiredEvents, t])

  // Optimistic: flip local state immediately, mirror to the server in the
  // background. A client-only id (matchmaking/expiry events, the static seed)
  // no-ops server-side harmlessly — see `NotificationsService#markRead`.
  const markRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    markNotificationRead(id).catch(() => {})
  }
  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllNotificationsRead().catch(() => {})
  }

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
  const user = useAuthUser()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const onItemClick = (item: NotificationItem) => {
    markRead(item.id)
    if (item.chatId) {
      // Team-chat notifications already carry a full `room-<id>` channel id; the
      // seeded demo notifications carry a bare chat id (`ch1`) that needs the
      // per-user `demo-…` prefix. Deep-link into whichever channel.
      const channel = item.chatId.startsWith("room-")
        ? item.chatId
        : demoChannelId(item.chatId, user.id)
      router.push(`/dashboard/chat?channel=${channel}`)
    } else if (item.href) {
      router.push(item.href)
    }
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
