"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ArrowDownRight, ArrowUpRight, Clock, MapPin, Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  type Court,
  type MatchRoom,
  type Player,
  type RoomLevel,
  type SportKey,
  formatVnd,
  levelAccent,
  SPORTS,
  sportAccent,
  sportLabel,
} from "@/features/dashboard/data"

/** Small tinted chip for a self-declared level (or "Any level"). */
export function LevelChip({
  level,
  className,
}: {
  level: RoomLevel
  className?: string
}) {
  const tc = useTranslations("Common")
  const label = level === "any" ? tc("level.any") : tc(`levels.${level}`)
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        levelAccent[level],
        className
      )}
    >
      {label}
    </span>
  )
}

/** Small accent dot encoding the sport. */
export function SportDot({
  sport,
  className,
}: {
  sport: SportKey
  className?: string
}) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        sportAccent(sport),
        className
      )}
      aria-hidden
    />
  )
}

/** Sport label with its accent dot, used as an inline tag. */
export function SportTag({ sport }: { sport: SportKey }) {
  const tc = useTranslations("Common")
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <SportDot sport={sport} />
      {tc.has(`sports.${sport}`) ? tc(`sports.${sport}`) : sportLabel(sport)}
    </span>
  )
}

/**
 * Scoreboard-style stat: condensed display numeral over a mono caption.
 * This typographic treatment is the dashboard's signature.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  icon: Icon,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const up = (delta ?? 0) >= 0
  return (
    <div className="flex flex-col gap-3 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground/70" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
            {value}
          </span>
          {unit ? (
            <span className="text-sm font-medium text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </div>
        {typeof delta === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
              up ? "text-brand" : "text-destructive"
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {up ? "+" : ""}
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Seven-day activity strip — active days carry the lime court accent. */
export function StreakStrip({
  days,
  size = "md",
}: {
  days: {
    day: string
    active: boolean
    sport: SportKey | null
    today?: boolean
  }[]
  size?: "md" | "lg"
}) {
  const t = useTranslations("Streak")
  return (
    <div className="flex items-end gap-1.5">
      {days.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-xl text-[11px] font-semibold tabular-nums transition-colors",
              size === "lg" ? "h-12" : "h-9",
              d.active
                ? "bg-gradient-to-b from-lime to-brand text-brand-foreground shadow-sm"
                : "bg-muted text-muted-foreground/50",
              d.today && "ring-2 ring-brand ring-offset-2 ring-offset-card"
            )}
          >
            {d.active && d.sport ? sportLabel(d.sport).slice(0, 2) : ""}
          </div>
          <span
            className={cn(
              "font-mono text-[10px] text-muted-foreground",
              d.today && "font-bold text-foreground"
            )}
          >
            {t(`weekdays.${i}`)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Compact radial gauge for an AI compatibility score. */
export function MatchMeter({ pct }: { pct: number }) {
  return (
    <div
      className="grid size-11 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--brand) ${pct * 3.6}deg, color-mix(in oklch, var(--muted-foreground) 22%, transparent) 0deg)`,
      }}
      role="img"
      aria-label={`${pct}% match`}
    >
      <div className="grid size-8.5 place-items-center rounded-full bg-card">
        <span className="font-heading text-sm leading-none font-bold tabular-nums">
          {pct}
        </span>
      </div>
    </div>
  )
}

/** Avatar with a presence dot. */
export function PlayerAvatar({
  initials,
  online,
  size = "default",
}: {
  initials: string
  online?: boolean
  size?: "default" | "sm" | "lg"
}) {
  return (
    <div className="relative">
      <Avatar size={size}>
        <AvatarFallback className="bg-secondary font-medium text-secondary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      {online ? (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-brand ring-2 ring-card" />
      ) : null}
    </div>
  )
}

/** A player suggestion line with an AI match score and a custom action. */
export function PlayerRow({
  player,
  action,
}: {
  player: Player
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-3xl p-2 transition-colors hover:bg-muted/60">
      <MatchMeter pct={player.matchPct} />
      <PlayerAvatar initials={player.initials} online={player.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{player.name}</span>
          <LevelChip level={player.level} />
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          <SportTag sport={player.sport} />
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" />
            {player.distanceKm} km
          </span>
        </div>
      </div>
      {action}
    </div>
  )
}

/** A court line with availability, price and a custom action. */
export function CourtRow({
  court,
  action,
}: {
  court: Court
  action?: React.ReactNode
}) {
  const t = useTranslations("Shared")
  return (
    <div className="flex items-center gap-3 rounded-3xl p-2 transition-colors hover:bg-muted/60">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-heading text-sm font-bold text-secondary-foreground">
        {court.name
          .split(" ")
          .slice(0, 2)
          .map((w) => w[0])
          .join("")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{court.name}</span>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
            <Star className="size-3 fill-lime text-lime" />
            {court.rating}
          </span>
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          <MapPin className="size-3" />
          {court.district} · {court.distanceKm} km
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="font-mono text-xs text-muted-foreground tabular-nums">
          {t("next", { time: court.nextSlot })}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatVnd(court.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">
            {t("perHour")}
          </span>
        </div>
      </div>
      {action}
    </div>
  )
}

/** A compact open-room line with its fill meter, level and a custom action. */
export function RoomRow({
  room,
  action,
}: {
  room: MatchRoom
  action?: React.ReactNode
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const title = t.has(`rooms.${room.id}.title`)
    ? t(`rooms.${room.id}.title`)
    : room.title
  const dayKey = room.day.toLowerCase()
  const day =
    dayKey === "today" || dayKey === "tomorrow" || dayKey === "yesterday"
      ? tc(`when.${dayKey}`)
      : room.day

  return (
    <div className="flex items-center gap-3 rounded-3xl p-2 transition-colors hover:bg-muted/60">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-heading text-sm font-bold text-secondary-foreground tabular-nums">
        {room.joined}/{room.capacity}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          <LevelChip level={room.level} className="shrink-0" />
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          <SportTag sport={room.sport} />
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" />
            {room.distanceKm} km
          </span>
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="flex items-center justify-end gap-1 font-mono text-xs text-muted-foreground tabular-nums">
          <Clock className="size-3" />
          {day} · {room.time}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">/h</span>
        </div>
      </div>
      {action}
    </div>
  )
}

// Per-sport tint for the decorative court banner (keyed by the court's first
// listed sport). The prototype has no real court photos, so each card's "image"
// is a deterministic gradient + court-line grid + oversized sport monogram.
const COURT_IMG: Record<SportKey, string> = {
  badminton: "from-chart-3/35 via-brand/15 to-lime/20",
}

/**
 * Decorative court "photo" — see COURT_IMG. Sizing is left to the caller via
 * `className` (e.g. a wide banner in the booking wizard, a tall thumbnail in the
 * Find Courts list).
 */
export function CourtImage({
  court,
  className,
}: {
  court: Court
  className?: string
}) {
  const sport = court.sports[0]
  const short = SPORTS.find((s) => s.key === sport)?.short ?? ""
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-gradient-to-br",
        COURT_IMG[sport],
        className
      )}
      aria-hidden
    >
      <div className="bg-court-lines absolute inset-0 opacity-70" />
      {/* Center net line */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/10" />
      <span className="absolute -right-2 -bottom-5 font-heading text-6xl font-bold text-foreground/10 select-none">
        {short}
      </span>
    </div>
  )
}

/** Right-aligned inset action button used inside rows. */
export function RowAction({
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 rounded-full"
      {...props}
    >
      {children}
    </Button>
  )
}
