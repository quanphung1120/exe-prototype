"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  Hourglass,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"

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
  formatVnd,
  pendingRequests,
  trustTier,
  trustTierAccent,
  type MatchRoom,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { useSession } from "@/components/dashboard/session"
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
 * trust scores), plus a switcher for any
 * other rooms the user has joined.
 */
export function ActiveRoomPill() {
  const t = useTranslations("ActiveRoom")
  const { joinedRooms, activeRoom, managerOpen, setManagerOpen } =
    useMatchmaking()
  const { sessions } = useSession()
  const { user: USER } = useData()

  if (!activeRoom) return null

  const extra = joinedRooms.length - 1
  const booked = Boolean(activeRoom.bookingId)
  // Join requests waiting on the user across every room they host.
  const pendingTotal = sessions.reduce(
    (n, s) =>
      n + (s.host.initials === USER.initials ? pendingRequests(s).length : 0),
    0
  )

  return (
    <Sheet open={managerOpen} onOpenChange={setManagerOpen}>
      <SheetTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-2.5 text-xs font-medium text-foreground transition-colors focus-visible:ring-2 focus-visible:outline-none",
          booked
            ? "border-brand/30 bg-brand/10 hover:bg-brand/15 focus-visible:ring-brand"
            : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 focus-visible:ring-amber-500"
        )}
        aria-label={t("pill")}
      >
        <span className="relative flex size-2 shrink-0">
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full",
              booked ? "bg-brand/70" : "bg-amber-500/70"
            )}
          />
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              booked ? "bg-brand" : "bg-amber-500"
            )}
          />
        </span>
        <span className="hidden sm:inline">{t("pill")}</span>
        <span className="text-muted-foreground">
          {booked ? `· ${activeRoom.time.split(" – ")[0]}` : t("noCourtShort")}
        </span>
        {extra > 0 ? (
          <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[10px] tabular-nums">
            {t("more", { count: extra })}
          </span>
        ) : null}
        {pendingTotal > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 font-mono text-[10px] text-amber-600 tabular-nums dark:text-amber-400">
            <Hourglass className="size-2.5" />
            {pendingTotal}
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
  const { joinedRooms, setActiveRoomId, leaveRoom, setRoomCapacity } =
    useMatchmaking()
  const {
    sessions,
    invitePlayer,
    kickPlayer,
    bookCourtForSession,
    approveRequest,
    declineRequest,
  } = useSession()
  const { setActiveChatId } = useChat()
  const { players: MATCH_SUGGESTIONS, user: USER } = useData()
  const router = useRouter()

  const session = sessions.find((s) => s.id === room.id)
  // Players awaiting this host's approval (host reviews their reliability).
  const requests = session ? pendingRequests(session) : []
  // Whether the user themselves is still waiting on this room's host.
  const awaitingApproval =
    session?.roster.find((p) => p.initials === USER.initials)?.rsvp ===
    "requested"

  const title = tm.has(`rooms.${room.id}.title`)
    ? tm(`rooms.${room.id}.title`)
    : room.title
  const others = joinedRooms.filter((r) => r.id !== room.id)
  const isHost = room.host.initials === USER.initials
  const full = room.joined >= room.capacity
  const booked = Boolean(room.bookingId)
  // People to invite: not already in the room (nor awaiting approval),
  // same-sport listed first.
  const requestedInitials = new Set(requests.map((p) => p.initials))
  const invitable = [...MATCH_SUGGESTIONS]
    .filter(
      (p) =>
        !room.players.includes(p.initials) && !requestedInitials.has(p.initials)
    )
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

  // The host's destructive action cancels (disbands) the room and surfaces the
  // cancellation/refund policy; a member's is a plain "leave". A booked room's
  // policy mentions the refund tiers since real money was held.
  const destructiveLabel = isHost ? t("cancelRoom") : t("leave")
  const destructiveTitle = isHost ? t("cancelRoomTitle") : t("leaveTitle")
  const destructiveConfirm = isHost ? t("cancelRoomConfirm") : t("leaveConfirm")
  const destructiveBody = isHost
    ? booked
      ? t("cancelBookedBody")
      : t("cancelFormingBody")
    : t("leaveBody")

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
        {/* Awaiting host approval — shown to the user while they're requested */}
        {awaitingApproval ? (
          <div className="flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-amber-700 dark:text-amber-400">
            <Hourglass className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("awaitingApproval")}</p>
              <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                {t("awaitingApprovalBody", { name: room.host.name })}
              </p>
            </div>
          </div>
        ) : null}

        {/* Location */}
        <section className="flex flex-col gap-2.5">
          <SectionLabel>{t("location")}</SectionLabel>
          <div className="flex flex-col gap-2 text-sm">
            <DetailRow icon={MapPin}>
              {room.venue} · {room.district} · {room.distanceKm} km
            </DetailRow>
            <DetailRow icon={Clock}>
              {booked
                ? `${roomDayLabel(room.day, tc)} · ${room.time}`
                : t("noCourtYet")}
            </DetailRow>
            <DetailRow icon={Users}>
              {tc(`sports.${room.sport}`)} ·{" "}
              {tc(`format.${room.format.toLowerCase()}`)} ·{" "}
              {formatVnd(room.pricePerHour)}/h
            </DetailRow>
          </div>

          {/* Court status — shown to ALL members */}
          {booked ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand/10 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-brand">
                <CalendarCheck className="size-4" />
                {t("booked", {
                  day: roomDayLabel(room.day, tc),
                  time: room.time,
                })}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-full"
                onClick={() => {
                  router.push("/dashboard/bookings")
                  onClose()
                }}
              >
                {t("viewInBookings")}
              </Button>
            </div>
          ) : isHost ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full"
              onClick={() => {
                bookCourtForSession(room.id)
                onClose()
              }}
            >
              <CalendarPlus />
              {t("bookCourt")}
            </Button>
          ) : (
            <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {t("hostNoCourt")}
            </p>
          )}
        </section>

        {/* Join requests — host reviews reliability before approving */}
        {isHost && requests.length ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>
              {t("requests", { count: requests.length })}
            </SectionLabel>
            <div className="flex flex-col gap-2">
              {requests.map((p) => (
                <RequestRow
                  key={p.initials}
                  initials={p.initials}
                  full={full}
                  onApprove={() => approveRequest(room.id, p.initials)}
                  onDecline={() => declineRequest(room.id, p.initials)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Participants */}
        <section className="flex flex-col gap-3">
          <SectionLabel>
            {t("participants", { count: room.players.length })}
          </SectionLabel>
          <div className="flex flex-col gap-3">
            {room.players.map((initials, i) => (
              <ParticipantRow
                key={`${initials}-${i}`}
                initials={initials}
                canKick={isHost && initials !== USER.initials}
                onKick={() => kickPlayer(room.id, initials)}
              />
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
        {awaitingApproval ? (
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={leave}
          >
            <X />
            {t("cancelRequest")}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={openChat}
            >
              <MessageSquare />
              {t("openChat")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    className="flex-1 rounded-full"
                  />
                }
              >
                {isHost ? <Trash2 /> : <LogOut />}
                {destructiveLabel}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{destructiveTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {destructiveBody}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("leaveCancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={leave}>
                    {destructiveConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetFooter>
    </>
  )
}

function ParticipantRow({
  initials,
  canKick,
  onKick,
}: {
  initials: string
  canKick?: boolean
  onKick?: () => void
}) {
  const t = useTranslations("ActiveRoom")
  const { userLevel } = useMatchmaking()
  const { user: USER, playerByInitials } = useData()
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
      {canKick ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-full text-muted-foreground"
          aria-label={t("remove")}
          onClick={onKick}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

/** A pending join request: the host reviews reliability, then approves/declines. */
function RequestRow({
  initials,
  full,
  onApprove,
  onDecline,
}: {
  initials: string
  full: boolean
  onApprove: () => void
  onDecline: () => void
}) {
  const t = useTranslations("ActiveRoom")
  const { playerByInitials } = useData()
  const { name, level, trust } = playerByInitials(initials)
  const tier = trustTier(trust)

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-muted/40 p-3">
      <div className="flex items-center gap-3">
        <PlayerAvatar initials={initials} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            <LevelChip level={level} />
          </div>
          <div
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 text-xs",
              trustTierAccent[tier]
            )}
          >
            <Star className="size-3 fill-current" />
            <span className="font-mono tabular-nums">{trust}</span>
            <span className="text-muted-foreground">
              · {t("reliability")} · {t(`trust.${tier}`)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          className="flex-1 rounded-full"
          disabled={full}
          onClick={onApprove}
        >
          <Check />
          {t("approve")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="flex-1 rounded-full"
          onClick={onDecline}
        >
          <X />
          {t("decline")}
        </Button>
      </div>
      {full ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          {t("requestFull")}
        </p>
      ) : null}
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
