"use client"

import { CourtDistance } from "@/features/dashboard/court-distance"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  ChevronRight,
  Clock,
  Crown,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlayerProfileDialog } from "@/features/dashboard/profile-dialog"
import { LevelChip, SportTag } from "@/features/dashboard/shared"
import {
  formatVnd,
  type MatchRoom,
  type RoomMember,
} from "@/features/dashboard/data"
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
  return (
    <div className="no-scrollbar flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
                onView={() => openManager(room.id)}
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
  onView,
}: {
  room: MatchRoom
  hosted: boolean
  joined: boolean
  requested: boolean
  conflict: boolean
  onJoin: () => void
  onLeave: () => void
  onView: () => void
}) {
  const t = useTranslations("MatchMaker")
  const tc = useTranslations("Common")
  const sUser = useAuthUser()
  const { userName } = useMatchmaking()
  const { user: USER, courtByVenue } = useData()
  const court = courtByVenue(room.venue)
  const address = court
    ? [court.ward, court.province].filter(Boolean).join(", ")
    : room.ward
  const [leaveHint, setLeaveHint] = React.useState(false)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined
  const title = t.has(`rooms.${room.id}.title`)
    ? t(`rooms.${room.id}.title`)
    : room.title
  const day = roomDayLabel(room.day, tc)

  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
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
            ) : null}
          </div>
          <p className="mt-1 truncate font-heading text-lg leading-tight font-semibold">
            {title}
          </p>
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
            {room.venue} · {address} ·{" "}
            <CourtDistance courtId={room.courtId} venue={room.venue} />
          </span>
        </span>
      </div>

      {/* Fill meter */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-2.5">
        <button
          type="button"
          className="-m-1 flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          title={t("members.view")}
          aria-label={t("members.view")}
          onClick={() => setMembersOpen(true)}
        >
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
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-normal text-muted-foreground">/h</span>
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t("hostedBy", {
            name:
              room.host.initials === USER.initials
                ? sUser.name || userName
                : room.host.name,
          })}
          {!hosted && !joined && !requested && !full
            ? ` · ${t("openSeats", { count: openSeats })}`
            : ""}
        </span>
        {hosted ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto shrink-0 rounded-full font-semibold"
            onClick={onView}
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
              "ml-auto shrink-0 rounded-full",
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
              "ml-auto shrink-0 rounded-full",
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
            className="ml-auto shrink-0 rounded-full font-semibold"
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

      <RoomMembersDialog
        room={room}
        title={title}
        hosted={hosted}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </div>
  )
}

/**
 * Who's already in a room — open to anyone browsing, so a player can see the
 * line-up (and open each member's profile) before asking to join.
 */
function RoomMembersDialog({
  room,
  title,
  hosted,
  open,
  onOpenChange,
}: {
  room: MatchRoom
  title: string
  hosted: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("MatchMaker")
  const sUser = useAuthUser()
  const { userName } = useMatchmaking()
  const { playerByInitials } = useData()
  const [profile, setProfile] = React.useState<RoomMember | null>(null)
  const [profileOpen, setProfileOpen] = React.useState(false)

  const members: RoomMember[] =
    room.members ??
    room.players.map((initials) => ({
      name: playerByInitials(initials).name,
      initials,
      host: initials === room.host.initials,
    }))
  // My own seat: the host entry of a room I host (it carries no userId), or
  // a cross-user entry stamped with my Clerk id.
  const isYou = (m: RoomMember) =>
    m.userId ? m.userId === sUser.id : hosted && m.host
  const openSeats = Math.max(0, room.capacity - members.length)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="player-play-overlay max-w-[calc(100%-2rem)] gap-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("members.title", {
                joined: members.length,
                capacity: room.capacity,
              })}
            </DialogTitle>
            <DialogDescription className="truncate">{title}</DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-1">
            {members.map((m, i) => {
              const you = isYou(m)
              const info = (
                <>
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {you ? sUser.name || userName : m.name || m.initials}
                    {you ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({t("members.you")})
                      </span>
                    ) : null}
                  </span>
                  {m.host ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                      <Crown className="size-3" />
                      {t("members.host")}
                    </span>
                  ) : null}
                </>
              )
              return (
                <li key={`${m.initials}-${i}`}>
                  {you ? (
                    <div className="flex items-center gap-3 rounded-xl p-2">
                      {info}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/60"
                      title={t("members.viewProfile")}
                      onClick={() => {
                        setProfile(m)
                        setProfileOpen(true)
                      }}
                    >
                      {info}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {openSeats ? (
            <p className="text-xs text-muted-foreground">
              {t("openSeats", { count: openSeats })}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <PlayerProfileDialog
        initials={profile?.initials ?? null}
        member={profile}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </>
  )
}
