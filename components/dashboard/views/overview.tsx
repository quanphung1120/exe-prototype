"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  CalendarCheck,
  Clock,
  Flame,
  Navigation,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ACTIVITY,
  BOOKINGS,
  COURTS,
  MATCH_SUGGESTIONS,
  STREAK,
  SPORTS,
  USER,
  type ActivityKind,
  type SportKey,
} from "@/components/dashboard/data"
import {
  CourtRow,
  PlayerRow,
  RowAction,
  SportTag,
  StreakStrip,
} from "@/components/dashboard/shared"

const ACTIVITY_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> =
  {
    "match-found": Sparkles,
    win: Trophy,
    loss: Swords,
    booking: CalendarCheck,
    rating: TrendingUp,
  }

export function OverviewView() {
  const [sport, setSport] = React.useState<SportKey | "all">("all")

  const nextMatch = BOOKINGS.find((b) => b.status === "confirmed")!
  const players = MATCH_SUGGESTIONS.filter(
    (p) => sport === "all" || p.sport === sport
  ).slice(0, 4)
  const courts = COURTS.filter(
    (c) => sport === "all" || c.sports.includes(sport)
  ).slice(0, 4)

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting + sport filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Good evening, {USER.first} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re on a{" "}
            <span className="font-semibold text-brand">
              {STREAK.current}-day streak
            </span>
            . One match today keeps it alive.
          </p>
        </div>
        <Tabs value={sport} onValueChange={(v) => setSport(v as SportKey | "all")}>
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {SPORTS.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Hero row: next match + streak */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Next match */}
        <div className="relative col-span-1 overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 lg:col-span-2 dark:ring-foreground/10">
          <div
            aria-hidden
            className="bg-court-lines pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(120%_120%_at_85%_0%,#000_0%,transparent_60%)]"
          />
          <div className="absolute -top-16 -right-16 size-48 rounded-full bg-brand/15 blur-3xl" />
          <div className="relative flex h-full flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                <span className="relative flex size-2">
                  <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand" />
                </span>
                Next match
              </span>
              <Badge className="bg-brand/12 text-brand">{nextMatch.day}</Badge>
            </div>

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <SportTag sport={nextMatch.sport} />
                  <span className="text-xs text-muted-foreground">
                    · {nextMatch.format}
                  </span>
                </div>
                <p className="mt-1 font-heading text-2xl font-bold tracking-tight">
                  {nextMatch.venue}
                </p>
                <p className="text-sm text-muted-foreground">{nextMatch.court}</p>
              </div>
              <div className="flex items-center gap-2 font-heading text-3xl font-bold tabular-nums">
                <Clock className="size-5 text-muted-foreground" />
                {nextMatch.time.split(" – ")[0]}
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
              <div className="flex items-center gap-3">
                <AvatarGroup>
                  {nextMatch.withPlayers.map((p) => (
                    <Avatar key={p.initials}>
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {p.initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </AvatarGroup>
                <div className="text-sm">
                  <span className="text-muted-foreground">with </span>
                  {nextMatch.withPlayers.map((p) => p.name).join(", ")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-full">
                  <Navigation />
                  Directions
                </Button>
                <Button size="sm" className="rounded-full">
                  Check in
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Streak (signature) */}
        <Link
          href="/dashboard/streak"
          className="group/streak relative overflow-hidden rounded-4xl bg-card p-6 text-left shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring dark:ring-foreground/10"
        >
          <div className="absolute -top-10 -right-8 size-32 rounded-full bg-lime/20 blur-2xl" />
          <div className="relative flex h-full flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                Current streak
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground/60 transition-transform group-hover/streak:translate-x-0.5 group-hover/streak:-translate-y-0.5" />
            </div>
            <div className="flex items-end gap-3">
              <Flame className="size-9 fill-lime/30 text-brand" />
              <span className="font-heading text-6xl leading-[0.8] font-bold tracking-tight tabular-nums">
                {STREAK.current}
              </span>
              <span className="mb-1 text-sm text-muted-foreground">days</span>
            </div>
            <StreakStrip days={STREAK.week} />
            <div className="mt-auto flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Target className="size-3.5" />
                Weekly goal
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {STREAK.weeklyDone}/{STREAK.weeklyGoal}
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Match maker + courts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="AI Match Maker"
          icon={Sparkles}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<Link href="/dashboard/match-maker" />}
            >
              See all
            </Button>
          }
        >
          {players.length ? (
            <div className="flex flex-col gap-1">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  action={<RowAction>Invite</RowAction>}
                />
              ))}
            </div>
          ) : (
            <Empty text="No players for this sport yet — try another filter." />
          )}
        </Panel>

        <Panel
          title="Courts near you"
          icon={Star}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<Link href="/dashboard/find-courts" />}
            >
              See all
            </Button>
          }
        >
          {courts.length ? (
            <div className="flex flex-col gap-1">
              {courts.map((c) => (
                <CourtRow
                  key={c.id}
                  court={c}
                  action={<RowAction>Book</RowAction>}
                />
              ))}
            </div>
          ) : (
            <Empty text="No open courts for this sport — try another filter." />
          )}
        </Panel>
      </div>

      {/* Activity */}
      <Panel title="Recent activity" icon={TrendingUp}>
        <ol className="flex flex-col">
          {ACTIVITY.map((a, i) => {
            const Icon = ACTIVITY_ICON[a.kind]
            return (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "grid size-8 place-items-center rounded-full ring-1 ring-border",
                      a.kind === "win" && "bg-brand/10 text-brand",
                      a.kind === "loss" && "bg-muted text-muted-foreground",
                      a.kind === "match-found" && "bg-lime/15 text-brand",
                      (a.kind === "booking" || a.kind === "rating") &&
                        "bg-secondary text-secondary-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  {i < ACTIVITY.length - 1 ? (
                    <span className="my-1 w-px flex-1 bg-border" />
                  ) : null}
                </div>
                <div className="pb-5">
                  <p className="text-sm">{a.text}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {a.time}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <header className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-3xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}
