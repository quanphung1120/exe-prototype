"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  Clock,
  Hourglass,
  LogOut,
  MapPin,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { LevelChip, SportTag } from "@/components/dashboard/shared"
import { useSportFilter } from "@/components/dashboard/sport-filter"
import { formatVnd, type MatchRoom } from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { useAuthUser } from "@/components/dashboard/auth-user"
import { useData } from "@/components/dashboard/data-provider"

/** Map a stored English day word ("Today"/"Tomorrow") to a localized label. */
function roomDayLabel(day: string, tc: (key: string) => string) {
  const key = day.toLowerCase()
  if (key === "today" || key === "tomorrow" || key === "yesterday") {
    return tc(`when.${key}`)
  }
  return day
}

export function RoomsView() {
  const t = useTranslations("MatchMaker")
  const {
    rooms,
    joinedIds,
    requestedIds,
    joinRoom,
    leaveRoom,
    openQuickJoin,
    openCreateRoom,
  } = useMatchmaking()
  const { sport } = useSportFilter()

  const visibleRooms = rooms.filter((r) => sport === "all" || r.sport === sport)

  return (
    <div className="flex flex-col gap-5">
      {/* Room grid */}
      {visibleRooms.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRooms.map((room) => {
            const requested = requestedIds.has(room.id)
            return (
              <RoomCard
                key={room.id}
                room={room}
                joined={joinedIds.has(room.id) && !requested}
                requested={requested}
                onJoin={() => joinRoom(room)}
                onLeave={() => leaveRoom(room.id)}
              />
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-4xl bg-card px-4 py-14 text-center shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Users className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">{t("emptyRooms")}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="rounded-full" onClick={openQuickJoin}>
              <Zap />
              {t("findMatch")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={openCreateRoom}
            >
              <Plus />
              {t("hostOne")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RoomCard({
  room,
  joined,
  requested,
  onJoin,
  onLeave,
}: {
  room: MatchRoom
  joined: boolean
  requested: boolean
  onJoin: () => void
  onLeave: () => void
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const sUser = useAuthUser()
  const { userName } = useMatchmaking()
  const { user: USER } = useData()
  const [leaveHint, setLeaveHint] = React.useState(false)
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined
  const title = t.has(`rooms.${room.id}.title`)
    ? t(`rooms.${room.id}.title`)
    : room.title
  const day = roomDayLabel(room.day, tc)

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg dark:ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SportTag sport={room.sport} />
            <span className="text-xs text-muted-foreground">
              · {tc(`format.${room.format.toLowerCase()}`)}
            </span>
          </div>
          <p className="mt-1 truncate font-heading text-lg leading-tight font-semibold">
            {title}
          </p>
        </div>
        <LevelChip level={room.level} className="shrink-0" />
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {room.venue} · {room.district} · {room.distanceKm} km
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {day} · {room.time}
          </span>
        </span>
      </div>

      {/* Fill meter */}
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-muted/50 p-2.5">
        <div className="flex items-center gap-2">
          <AvatarGroup>
            {room.players.map((p, i) => (
              <Avatar key={i} className="size-7">
                <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
                  {p}
                </AvatarFallback>
              </Avatar>
            ))}
            {Array.from({ length: openSeats }).map((_, i) => (
              <span
                key={`seat-${i}`}
                className="grid size-7 place-items-center rounded-full border border-dashed border-border bg-background text-muted-foreground ring-2 ring-background"
              >
                <Users className="size-3" />
              </span>
            ))}
          </AvatarGroup>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {room.joined}/{room.capacity}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">/h</span>
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t("hostedBy", { name: room.host.initials === USER.initials ? (sUser.name || userName) : room.host.name })}
          {!joined && !requested && !full
            ? ` · ${t("openSeats", { count: openSeats })}`
            : ""}
        </span>
        {requested ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "ml-auto shrink-0 rounded-full",
              leaveHint && "bg-destructive/10 text-destructive"
            )}
          >
            {leaveHint ? (
              <>
                <X />
                {t("cancelRequest")}
              </>
            ) : (
              <>
                <Hourglass />
                {t("requested")}
              </>
            )}
          </Button>
        ) : joined ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "ml-auto shrink-0 rounded-full",
              leaveHint && "bg-destructive/10 text-destructive"
            )}
          >
            {leaveHint ? (
              <>
                <LogOut />
                {t("leave")}
              </>
            ) : (
              <>
                <Check />
                {t("joined")}
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            className="ml-auto shrink-0 rounded-full text-base font-semibold"
            variant={full ? "outline" : "default"}
            disabled={full}
            onClick={onJoin}
          >
            {full ? t("full") : t("join")}
          </Button>
        )}
      </div>
    </div>
  )
}
