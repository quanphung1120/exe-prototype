"use client"

import * as React from "react"
import { CalendarPlus, Clock, MapPin, Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BOOKINGS,
  type Booking,
  type BookingStatus,
} from "@/components/dashboard/data"
import { SportTag } from "@/components/dashboard/shared"

type Filter = "upcoming" | "past" | "all"

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
}

export function BookingsView() {
  const [filter, setFilter] = React.useState<Filter>("upcoming")

  const bookings = BOOKINGS.filter((b) => {
    if (filter === "all") return true
    const upcoming = UPCOMING.includes(b.status)
    return filter === "upcoming" ? upcoming : !upcoming
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" className="rounded-full">
          <CalendarPlus />
          New booking
        </Button>
      </div>

      {bookings.length ? (
        <div className="flex flex-col gap-3">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      ) : (
        <p className="rounded-4xl bg-card px-4 py-16 text-center text-sm text-muted-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          Nothing here yet. Book a court to get your next match on the calendar.
        </p>
      )}
    </div>
  )
}

function BookingCard({ booking }: { booking: Booking }) {
  const done = booking.status === "completed"
  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:flex-row sm:items-center dark:ring-foreground/10">
      {/* Date block */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="grid w-16 shrink-0 place-items-center rounded-3xl bg-secondary py-3 text-center text-secondary-foreground">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {booking.day.split(",")[0].slice(0, 3)}
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
          <span className="text-xs text-muted-foreground">· {booking.format}</span>
        </div>
        <p className="mt-0.5 font-heading text-lg font-semibold">
          {booking.venue}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {booking.court}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {booking.day} · {booking.time}
          </span>
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
              {booking.result === "W" ? "Win" : "Loss"}
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
      {!done ? (
        <div className="shrink-0 sm:ml-2">
          <Button variant="outline" size="sm" className="w-full rounded-full sm:w-auto">
            Manage
          </Button>
        </div>
      ) : (
        <div className="shrink-0 sm:ml-2">
          <Button variant="ghost" size="sm" className="w-full rounded-full sm:w-auto">
            Rebook
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: BookingStatus }) {
  if (status === "confirmed")
    return <Badge className="bg-brand/12 text-brand">{STATUS_LABEL[status]}</Badge>
  if (status === "pending")
    return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>
  if (status === "cancelled")
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
}
