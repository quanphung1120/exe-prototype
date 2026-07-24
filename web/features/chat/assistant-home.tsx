"use client"

import * as React from "react"
import {
  ArrowRight,
  CalendarCheck2,
  ChevronRight,
  Clock,
  MapPin,
  UserPlus,
  Users,
  Zap,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useSession } from "@/features/play/session"
import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

// ─── Quick actions ────────────────────────────────────────────────────────────
// Short labels on the chips; tapping one submits the full prompt text so the
// model still gets the richer query it was tuned for.

const ACTIONS = [
  { key: "badmintonNearMe", icon: MapPin },
  { key: "bookTomorrow", icon: Clock },
  { key: "sameLevelPlayers", icon: Users },
  { key: "badmintonTeammates", icon: UserPlus },
  { key: "quickMatch", icon: Zap },
] as const

export function QuickActions({ onPick }: { onPick: (text: string) => void }) {
  const t = useTranslations("AiDashboard")
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("quickActionsLabel")}</h2>
      <div className="flex flex-wrap gap-3">
        {ACTIONS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(t(`prompts.${key}`))}
            className="flex items-center gap-2.5 rounded-xl bg-card px-4 py-3 text-sm font-medium shadow-md ring-1 ring-foreground/5 transition-colors hover:bg-muted/40 dark:ring-foreground/10"
          >
            <Icon className="size-4 shrink-0 text-foreground/70" />
            {t(`promptsShort.${key}`)}
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Recent chats ─────────────────────────────────────────────────────────────
// There is no persisted-conversation endpoint, so these are illustrative
// entries; tapping one replays the described query as a fresh prompt.

const RECENTS = [
  { key: "booking", icon: CalendarCheck2 },
  { key: "players", icon: Users },
  { key: "summary", icon: Zap },
] as const

export function RecentChats({ onPick }: { onPick: (text: string) => void }) {
  const t = useTranslations("AiDashboard")
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("recentChats")}</h2>
        <Link
          href="/dashboard/chat"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("viewAll")}
          <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-border rounded-2xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        {RECENTS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(t(`recent.${key}.desc`))}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/40"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60">
              <Icon className="size-4 text-foreground/70" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {t(`recent.${key}.title`)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t(`recent.${key}.desc`)}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t(`recent.${key}.time`)}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Right rail ───────────────────────────────────────────────────────────────

interface UpcomingEntry {
  id: string
  dayKey: string
  time: string
  venue: string
  players: number
  status: "confirmed" | "pending"
}

// Shown when the signed-in user has no upcoming bookings yet — the rail keeps
// its shape instead of collapsing to an empty card.
const SAMPLE_UPCOMING: UpcomingEntry[] = [
  {
    id: "sample-1",
    dayKey: "2026-05-24",
    time: "6:00 PM – 7:30 PM",
    venue: "Tan Binh Badminton Center",
    players: 4,
    status: "confirmed",
  },
  {
    id: "sample-2",
    dayKey: "2026-05-25",
    time: "8:00 AM – 9:30 AM",
    venue: "QK7 Sports Complex",
    players: 2,
    status: "pending",
  },
]

function dateParts(iso: string, locale: string) {
  const d = new Date(`${iso}T00:00:00`)
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, opts).format(d).replace(".", "")
  return {
    month: fmt({ month: "short" }).toUpperCase(),
    day: d.getDate(),
    weekday: fmt({ weekday: "short" }).toUpperCase(),
  }
}

const FEED = [
  { key: "matchAccepted", name: "Minh D.", initials: "MD" },
  { key: "bookingConfirmed", icon: CalendarCheck2 },
  { key: "joinedChat", name: "Huyền T.", initials: "HT" },
  { key: "newMatches", icon: Zap },
] as const

export function AssistantSideRail() {
  const t = useTranslations("AiDashboard")
  const locale = useLocale()
  const { bookings } = useSession()

  // Real upcoming bookings when the user has them; the activity feed has no
  // backing endpoint yet, so it stays illustrative.
  const upcoming = React.useMemo<UpcomingEntry[]>(() => {
    const live = bookings
      .filter(
        (b) =>
          (b.status === "confirmed" || b.status === "pending") &&
          typeof b.dayKey === "string"
      )
      .sort((a, b) => (a.dayKey ?? "").localeCompare(b.dayKey ?? ""))
      .slice(0, 2)
      .map((b) => ({
        id: b.id,
        dayKey: b.dayKey as string,
        time: b.time,
        venue: b.venue,
        players: Math.max(b.withPlayers.length + 1, 1),
        status: b.status as "confirmed" | "pending",
      }))
    return live.length ? live : SAMPLE_UPCOMING
  }, [bookings])

  return (
    <aside className="sticky top-0 hidden w-80 shrink-0 flex-col gap-5 xl:flex">
      <section className="rounded-2xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("upcomingBookings")}</h2>
          <Link
            href="/dashboard/bookings"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("viewAll")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {upcoming.map((b) => {
            const date = dateParts(b.dayKey, locale)
            const confirmed = b.status === "confirmed"
            return (
              <div
                key={b.id}
                className="flex gap-3 rounded-xl bg-muted/30 p-3"
              >
                <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/60">
                  <span className="text-[9px] font-semibold tracking-wider text-muted-foreground">
                    {date.month}
                  </span>
                  <span className="text-lg leading-tight font-bold">
                    {date.day}
                  </span>
                  <span className="text-[9px] font-semibold tracking-wider text-muted-foreground">
                    {date.weekday}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.time}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.venue}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {t("playersCount", { count: b.players })}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-medium",
                        confirmed
                          ? "text-brand"
                          : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          confirmed ? "bg-brand" : "bg-amber-500"
                        )}
                        aria-hidden
                      />
                      {t(`status.${b.status}`)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("activityFeed")}</h2>
        </div>
        <div className="flex flex-col gap-4 p-4">
          {FEED.map((item) => (
            <div key={item.key} className="flex items-start gap-3">
              {"initials" in item ? (
                <Avatar className="size-9">
                  <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                    {item.initials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                  <item.icon className="size-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  {"name" in item ? (
                    <>
                      <span className="font-semibold">{item.name}</span>{" "}
                      {t(`activity.${item.key}`)}
                    </>
                  ) : (
                    t(`activity.${item.key}`)
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(`activity.${item.key}Time`)}
                </p>
              </div>
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand"
                aria-hidden
              />
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
