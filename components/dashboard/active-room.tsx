"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ChevronRight,
  Clock,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Star,
  UserPlus,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  LevelChip,
  PlayerAvatar,
  SportDot,
  SportTag,
} from "@/components/dashboard/shared"
import {
  MATCH_SUGGESTIONS,
  USER,
  formatVnd,
  playerByInitials,
  trustTier,
  trustTierAccent,
  type MatchRoom,
} from "@/components/dashboard/data"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { roomChatId, useChat } from "@/components/dashboard/chat-store"
import { useRouter } from "@/i18n/navigation"

/** Map a stored English day word ("Today"/"Tomorrow") to a localized label. */
function roomDayLabel(day: string, tc: (key: string) => string) {
  const key = day.toLowerCase()
  if (key === "today" || key === "tomorrow" || key === "yesterday") {
    return tc(`when.${key}`)
  }
  return day
}

/**
 * Persistent topbar pill shown whenever the user is in at least one match room.
 * It opens a slide-over with the active room's location, participants (and their
 * trust scores), plus a switcher for any other rooms the user has joined.
 */
export function ActiveRoomPill() {
  const t = useTranslations("ActiveRoom")
  const tc = useTranslations("Common")
  const { joinedRooms, activeRoom, managerOpen, setManagerOpen } =
    useMatchmaking()

  if (!activeRoom) return null

  const extra = joinedRooms.length - 1

  return (
    <Sheet open={managerOpen} onOpenChange={setManagerOpen}>
      <SheetTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 py-1.5 pr-3 pl-2.5 text-xs font-medium text-foreground transition-colors hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        )}
        aria-label={t("pill")}
      >
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70" />
          <span className="relative inline-flex size-2 rounded-full bg-brand" />
        </span>
        <span className="hidden sm:inline">{t("pill")}</span>
        <span className="text-muted-foreground">
          {tc(`sports.${activeRoom.sport}`)}
        </span>
        {extra > 0 ? (
          <span className="rounded-full bg-brand/20 px-1.5 font-mono text-[10px] text-brand tabular-nums">
            {t("more", { count: extra })}
          </span>
        ) : null}
      </SheetTrigger>

      <SheetContent className="w-full gap-0 p-0 sm:max-w-sm">
        <RoomDetail room={activeRoom} onClose={() => setManagerOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function RoomDetail({
  room,
  onClose,
}: {
  room: MatchRoom
  onClose: () => void
}) {
  const t = useTranslations("ActiveRoom")
  const tc = useTranslations("Common")
  const tm = useTranslations("MatchMaker")
  const {
    joinedRooms,
    setActiveRoomId,
    leaveRoom,
    setRoomCapacity,
    invitePlayer,
  } = useMatchmaking()
  const { setActiveChatId } = useChat()
  const router = useRouter()

  const title = tm.has(`rooms.${room.id}.title`)
    ? tm(`rooms.${room.id}.title`)
    : room.title
  const others = joinedRooms.filter((r) => r.id !== room.id)
  const isHost = room.host.initials === USER.initials
  const full = room.joined >= room.capacity
  // People to invite: not already in the room, same-sport listed first.
  const invitable = [...MATCH_SUGGESTIONS]
    .filter((p) => !room.players.includes(p.initials))
    .sort(
      (a, b) =>
        (a.sport === room.sport ? 0 : 1) - (b.sport === room.sport ? 0 : 1) ||
        b.matchPct - a.matchPct
    )

  const openChat = () => {
    setActiveChatId(roomChatId(room.id))
    router.push("/dashboard/chat")
    onClose()
  }

  const leave = () => {
    leaveRoom(room.id)
    onClose()
  }

  return (
    <>
      <SheetHeader className="gap-2 border-b border-border pr-14">
        <div className="flex items-center gap-2">
          <SportTag sport={room.sport} />
          <span className="text-xs text-muted-foreground">
            · {tc(`format.${room.format.toLowerCase()}`)}
          </span>
        </div>
        <SheetTitle className="text-lg leading-tight">{title}</SheetTitle>
        <SheetDescription>
          {tm("hostedBy", { name: room.host.name })}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        {/* Location */}
        <section className="flex flex-col gap-2.5">
          <SectionLabel>{t("location")}</SectionLabel>
          <div className="flex flex-col gap-2 text-sm">
            <DetailRow icon={MapPin}>
              {room.venue} · {room.district} · {room.distanceKm} km
            </DetailRow>
            <DetailRow icon={Clock}>
              {roomDayLabel(room.day, tc)} · {room.time}
            </DetailRow>
            <DetailRow icon={Users}>
              {tc(`sports.${room.sport}`)} ·{" "}
              {tc(`format.${room.format.toLowerCase()}`)} ·{" "}
              {formatVnd(room.pricePerHour)}/h
            </DetailRow>
          </div>
        </section>

        {/* Participants */}
        <section className="flex flex-col gap-3">
          <SectionLabel>
            {t("participants", { count: room.players.length })}
          </SectionLabel>
          <div className="flex flex-col gap-3">
            {room.players.map((initials, i) => (
              <ParticipantRow key={`${initials}-${i}`} initials={initials} />
            ))}
          </div>
        </section>

        {/* Host controls — only for rooms the user owns */}
        {isHost ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>{t("hostControls")}</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{t("maxPlayers")}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={room.capacity <= room.joined}
                  aria-label={t("maxPlayersDec")}
                  onClick={() => setRoomCapacity(room.id, room.capacity - 1)}
                >
                  <Minus />
                </Button>
                <span className="w-6 text-center font-mono text-sm tabular-nums">
                  {room.capacity}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={room.capacity >= 8}
                  aria-label={t("maxPlayersInc")}
                  onClick={() => setRoomCapacity(room.id, room.capacity + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                {t("invitePlayers")}
              </span>
              {full ? (
                <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {t("roomFull")}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {invitable.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 p-1">
                      <PlayerAvatar initials={p.initials} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm">{p.name}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <LevelChip level={p.level} />
                          {tc(`sports.${p.sport}`)}
                        </span>
                      </div>
                      <Button
                        size="xs"
                        variant="outline"
                        className="shrink-0 rounded-full"
                        onClick={() => invitePlayer(room.id, p.initials)}
                      >
                        <UserPlus />
                        {t("invite")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Other joined rooms */}
        {others.length ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>{t("otherRooms")}</SectionLabel>
            <div className="flex flex-col gap-1">
              {others.map((r) => {
                const rTitle = tm.has(`rooms.${r.id}.title`)
                  ? tm(`rooms.${r.id}.title`)
                  : r.title
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRoomId(r.id)}
                    className="flex w-full items-center gap-2.5 rounded-2xl p-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <SportDot sport={r.sport} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {rTitle}
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.venue}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          onClick={openChat}
        >
          <MessageSquare />
          {t("openChat")}
        </Button>
        <Button
          variant="destructive"
          className="flex-1 rounded-full"
          onClick={leave}
        >
          <LogOut />
          {t("leave")}
        </Button>
      </SheetFooter>
    </>
  )
}

function ParticipantRow({ initials }: { initials: string }) {
  const t = useTranslations("ActiveRoom")
  const { userLevel } = useMatchmaking()
  const { name, level, trust } = playerByInitials(initials)
  const tier = trustTier(trust)
  const isYou = initials === USER.initials

  return (
    <div className="flex items-center gap-3">
      <PlayerAvatar initials={initials} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {name}
            {isYou ? (
              <span className="text-muted-foreground"> ({t("you")})</span>
            ) : null}
          </span>
          <LevelChip level={isYou ? userLevel : level} />
        </div>
        <div
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-xs",
            trustTierAccent[tier]
          )}
        >
          <Star className="size-3 fill-current" />
          <span className="font-mono tabular-nums">{trust}</span>
          <span className="text-muted-foreground">· {t(`trust.${tier}`)}</span>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </span>
  )
}
