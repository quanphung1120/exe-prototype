"use client"

import { CourtDistance } from "@/features/dashboard/court-distance"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  Clock,
  Eye,
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
import { LevelChip, SportTag } from "@/features/dashboard/shared"
import { formatVnd, type MatchRoom } from "@/features/dashboard/data"
import { RoomPreviewSheet } from "@/features/play/active-room"
import { useMatchmaking } from "@/features/play/matchmaking"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"

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
    hostedIds,
    hasTimeConflict,
    joinRoom,
    leaveRoom,
    openManager,
    openQuickJoin,
    openCreateRoom,
  } = useMatchmaking()
  // Kept separately from `open` so the sheet still has its room while it
  // animates closed.
  const [preview, setPreview] = React.useState<{
    id: string | null
    open: boolean
  }>({ id: null, open: false })
  return (
    <div className="no-scrollbar flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <RoomPreviewSheet
        roomId={preview.id}
        open={preview.open}
        onOpenChange={(open) => setPreview((p) => ({ ...p, open }))}
      />
      {/* Room grid */}
      {rooms.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const hosted = hostedIds.has(room.id)
            const requested = !hosted && requestedIds.has(room.id)
            const joined = !hosted && joinedIds.has(room.id) && !requested
            return (
              <RoomCard
                key={room.id}
                room={room}
                hosted={hosted}
                joined={joined}
                requested={requested}
                // Only surface a time clash for rooms the user isn't already in
                // — a room they've joined or requested is itself a commitment and
                // shouldn't read as "conflicting" with the join button.
                conflict={
                  !hosted && !joined && !requested && hasTimeConflict(room)
                }
                onJoin={() => joinRoom(room)}
                onLeave={() => leaveRoom(room.id)}
                // Rooms I'm in open the manager (the pill's sheet); any other
                // room opens the same details read-only, with a join action.
                onOpen={() =>
                  hosted || joined
                    ? openManager(room.id)
                    : setPreview({ id: room.id, open: true })
                }
              />
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-border bg-card px-4 py-14 text-center">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
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
  hosted,
  joined,
  requested,
  conflict,
  onJoin,
  onLeave,
  onOpen,
}: {
  room: MatchRoom
  hosted: boolean
  joined: boolean
  requested: boolean
  conflict: boolean
  onJoin: () => void
  onLeave: () => void
  onOpen: () => void
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const sUser = useAuthUser()
  const { userName } = useMatchmaking()
  const { courtByVenue } = useData()
  const court = courtByVenue(room.venue)
  const address = court
    ? [court.ward, court.province].filter(Boolean).join(", ")
    : room.ward
  const [leaveHint, setLeaveHint] = React.useState(false)
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined
  const title = t.has(`rooms.${room.id}.title`)
    ? t(`rooms.${room.id}.title`)
    : room.title
  const day = roomDayLabel(room.day, tc)

  return (
    <div className="relative flex cursor-pointer flex-col gap-4 rounded-[28px] border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SportTag sport={room.sport} />
            <span className="text-xs text-muted-foreground">
              · {tc(`format.${room.format.toLowerCase()}`)}
            </span>
            {room.demo ? (
              <span
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                title={t("demoJoin")}
              >
                {t("demoBadge")}
              </span>
            ) : (
              // Creating a room doesn't book a court — say so up front.
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  room.bookingId
                    ? "bg-brand/10 text-brand"
                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                )}
              >
                {room.bookingId ? t("courtBooked") : t("courtNotBooked")}
              </span>
            )}
          </div>
          {/* Stretched over the whole card: clicking anywhere opens the
              room's details; the footer buttons sit above it (z-10). */}
          <button
            type="button"
            className="mt-1 block max-w-full truncate text-left font-heading text-lg leading-tight font-semibold after:absolute after:inset-0 after:rounded-[28px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            title={t("viewDetails")}
            onClick={onOpen}
          >
            {title}
          </button>
        </div>
        <LevelChip level={room.level} className="shrink-0" />
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Clock className="size-3.5 shrink-0 text-brand" />
          <span className="min-w-0 truncate">
            {day} · {room.time}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {room.venue ? (
              <>
                {room.venue} · {address} ·{" "}
                <CourtDistance courtId={room.courtId} venue={room.venue} />
              </>
            ) : (
              t("dialog.noCourt")
            )}
          </span>
        </span>
      </div>

      {/* Fill meter */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-2.5">
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
        {room.pricePerHour ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatVnd(room.pricePerHour)}
            <span className="text-xs font-normal text-muted-foreground">
              /h
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t("hostedBy", {
            name: hosted ? sUser.name || userName : room.host.name,
          })}
          {!hosted && !joined && !requested && !full
            ? ` · ${t("openSeats", { count: openSeats })}`
            : ""}
        </span>
        {hosted ? (
          <Button
            size="sm"
            variant="outline"
            className="relative z-10 ml-auto shrink-0 rounded-full font-semibold"
            onClick={onOpen}
          >
            <Eye />
            {t("viewRoom")}
          </Button>
        ) : requested ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "relative z-10 ml-auto shrink-0 rounded-full",
              leaveHint
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "bg-amber-500/12 text-amber-700 hover:bg-amber-500/15"
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
            variant="ghost"
            onClick={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "relative z-10 ml-auto shrink-0 rounded-full",
              leaveHint
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "bg-brand/10 text-brand hover:bg-brand/15"
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
            className="relative z-10 ml-auto shrink-0 rounded-full font-semibold"
            variant={full || conflict || room.demo ? "outline" : "default"}
            disabled={full || conflict || room.demo}
            title={room.demo ? t("demoJoin") : undefined}
            onClick={onJoin}
          >
            {room.demo
              ? t("demoBadge")
              : full
                ? t("full")
                : conflict
                  ? t("timeClash")
                  : t("join")}
          </Button>
        )}
      </div>
    </div>
  )
}
