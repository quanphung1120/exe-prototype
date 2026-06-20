"use client"

import * as React from "react"
import { Clock, MapPin, Trophy, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type Booking, type BookingStatus } from "@/components/dashboard/data"
import { useBooking } from "@/components/dashboard/booking"
import { SportTag } from "@/components/dashboard/shared"

type Filter = "upcoming" | "past" | "all"

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

export function BookingsView() {
  const t = useTranslations("Bookings")
  const [filter, setFilter] = React.useState<Filter>("upcoming")
  const { bookings } = useBooking()

  const visible = bookings.filter((b) => {
    if (filter === "all") return true
    const upcoming = UPCOMING.includes(b.status)
    return filter === "upcoming" ? upcoming : !upcoming
  })

  return (
    <div className="flex flex-col gap-5">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="upcoming">{t("tabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="past">{t("tabs.past")}</TabsTrigger>
          <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length ? (
        <div className="flex flex-col gap-3">
          {visible.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      ) : (
        <p className="rounded-4xl bg-card px-4 py-16 text-center text-sm text-muted-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          {t("empty")}
        </p>
      )}
    </div>
  )
}

/** Day words that resolve to a shared `Common.when` key. */
const WHEN_KEY: Record<string, string> = {
  Today: "today",
  Tomorrow: "tomorrow",
  Yesterday: "yesterday",
}

function BookingCard({ booking }: { booking: Booking }) {
  const t = useTranslations("Bookings")
  const tc = useTranslations("Common")
  const { cancelBooking, rebookFrom, addTeamToSession } = useBooking()
  const done = booking.status === "completed"
  const cancelled = booking.status === "cancelled"
  const hasTeam = Boolean(booking.roomId)
  // Solo = just the host on the booking; only then offer to add a team.
  const solo = booking.withPlayers.length <= 1

  const going = booking.withPlayers.filter((p) => p.status !== "pending").length
  const invited = booking.withPlayers.filter(
    (p) => p.status === "pending"
  ).length

  const tb = useTranslations("Booking")
  const whenKey = WHEN_KEY[booking.day]
  const dayLabel = booking.dayKey
    ? tb(`days.${booking.dayKey}`)
    : whenKey
      ? tc(`when.${whenKey}`)
      : t(`records.${booking.id}.day`)
  const courtNo = booking.court.match(/\d+/)?.[0]
  const courtLabel = courtNo ? t("courtLabel", { n: courtNo }) : booking.court

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:flex-row sm:items-center dark:ring-foreground/10">
      {/* Date block */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="grid w-16 shrink-0 place-items-center rounded-3xl bg-secondary py-3 text-center text-secondary-foreground">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {dayLabel.split(",")[0].slice(0, 3)}
          </span>
          <span className="font-heading text-xl leading-none font-bold tabular-nums">
            {booking.time.split(":")[0]}
            <span className="text-xs">
              :{booking.time.split(":")[1].slice(0, 2)}
            </span>
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SportTag sport={booking.sport} />
          <span className="text-xs text-muted-foreground">
            · {tc(`format.${booking.format.toLowerCase()}`)}
          </span>
        </div>
        <p className="mt-0.5 font-heading text-lg font-semibold">
          {booking.venue}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {courtLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {dayLabel} · {booking.time}
          </span>
          {invited > 0 ? (
            <span className="inline-flex items-center gap-1">
              {t("goingInvited", { going, invited })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Players + status/result */}
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        <AvatarGroup>
          {booking.withPlayers.map((p) => (
            <Avatar key={p.initials}>
              <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                {p.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>

        {done && booking.result ? (
          <div className="flex items-center gap-2">
            <Badge
              className={cn(
                booking.result === "W"
                  ? "bg-brand/12 text-brand"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Trophy className="size-3" />
              {booking.result === "W" ? tc("result.win") : tc("result.loss")}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {booking.score}
            </span>
          </div>
        ) : (
          <StatusBadge status={booking.status} />
        )}
      </div>

      {/* Action */}
      {done || cancelled ? (
        <div className="shrink-0 sm:ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-full sm:w-auto"
            onClick={() => rebookFrom(booking.id)}
          >
            {t("rebook")}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 sm:ml-2">
          {solo ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => addTeamToSession(booking.id)}
            >
              <UserPlus />
              {t("addTeam")}
            </Button>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="sm" className="rounded-full" />
              }
            >
              {t("cancel")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {hasTeam ? t("cancelTeamBody") : t("cancelSoloBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => cancelBooking(booking.id)}
                >
                  {t("cancelConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const tc = useTranslations("Common")
  const label = tc(`status.${status}`)
  if (status === "confirmed")
    return <Badge className="bg-brand/12 text-brand">{label}</Badge>
  if (status === "pending") return <Badge variant="secondary">{label}</Badge>
  if (status === "cancelled")
    return <Badge variant="destructive">{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}
