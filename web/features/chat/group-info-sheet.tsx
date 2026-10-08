"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  Crown,
  LogOut,
  MapPin,
  Pencil,
  Search,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"
import type { ChannelMemberResponse } from "stream-chat"
import { useChannelStateContext, useChatContext } from "stream-chat-react"

import type { GroupMatch, GroupMatchResult } from "@/lib/shared"
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
} from "@/components/ui/alert-dialog"
import { AvatarBadge } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ChatAvatar } from "@/features/chat/chat-avatar"
import {
  addGroupMembers,
  deleteGroup,
  getGroupMatch,
  myMatchRatings,
  ratePlayer,
  removeGroupMember,
  renameGroup,
} from "@/features/chat/group-actions"
import { MobilePaneContext } from "@/features/chat/mobile-pane-context"
import {
  leaveConversation,
  searchUsers,
  type FoundUser,
} from "@/features/chat/stream-actions"
import { useSession } from "@/features/play/session"

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY_LEN = 3
const COMMENT_MAX = 300

/** True for a group conversation (vs a DM / venue chat) — gates the info button. */
export function isGroupConversation(
  channelId: string | undefined,
  memberCount: number,
  isVenueChat: boolean
): boolean {
  if (!channelId || isVenueChat || channelId.startsWith("dm-")) return false
  return (
    channelId.startsWith("group-") ||
    channelId.startsWith("room-") ||
    memberCount > 2
  )
}

const memberId = (m: ChannelMemberResponse) => m.user_id ?? m.user?.id ?? ""

/**
 * Group-chat info panel: rename (any member), the match the group is
 * coordinating (book a court when none is booked yet), members — the owner
 * removes/adds, and once the match is over everyone who played rates the
 * others — and leaving. Rendered inside the Stream `<Channel>`, so members and
 * the name update live from channel events.
 */
export function GroupInfoSheet({
  open,
  onOpenChange,
  currentUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
}) {
  const t = useTranslations("GroupInfo")
  const { channel, members } = useChannelStateContext()
  const { setActiveChannel } = useChatContext()
  const { showList } = React.useContext(MobilePaneContext)
  const {
    sessions,
    kickPlayer,
    bookCourtForSession,
    createGroupSession,
    leaveRoom,
    disbandOwnRoom,
    joinedIds,
  } = useSession()

  const channelId = channel.id ?? ""
  const isRoom = channelId.startsWith("room-")
  const isCommunity = channelId.startsWith("group-")
  const name = channel.data?.name ?? t("untitled")
  const ownerId = channel.data?.created_by?.id ?? null
  const isOwner = ownerId === currentUserId

  const memberList = React.useMemo(() => {
    const list = Object.values(members ?? {})
    const rank = (m: ChannelMemberResponse) =>
      memberId(m) === ownerId ? 0 : memberId(m) === currentUserId ? 1 : 2
    return list.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.user?.name ?? "").localeCompare(b.user?.name ?? "")
    )
  }, [members, ownerId, currentUserId])
  const memberIds = memberList.map(memberId)

  // ── The group's match (re-fetched each time the panel opens) ──
  const [openTick, setOpenTick] = React.useState(0)
  const fetchKey = `${channelId}:${openTick}`
  const [matchState, setMatchState] = React.useState<{
    key: string
    result: GroupMatchResult | null
    rated: Record<string, number>
  } | null>(null)
  const loadingMatch = open && matchState?.key !== fetchKey

  React.useEffect(() => {
    if (!open || !channelId) return
    let active = true
    void (async () => {
      let result: GroupMatchResult | null = null
      let rated: Record<string, number> = {}
      try {
        result = await getGroupMatch(channelId)
        if (result.match?.ended) {
          const mine = await myMatchRatings(result.match.sessionId)
          rated = Object.fromEntries(mine.map((r) => [r.rateeId, r.stars]))
        }
      } catch {
        // Leave `result` null — the card shows a soft error.
      }
      if (active) setMatchState({ key: fetchKey, result, rated })
    })()
    return () => {
      active = false
    }
  }, [open, channelId, fetchKey])

  const handleOpenChange = (next: boolean) => {
    if (next) setOpenTick((n) => n + 1)
    if (!next) {
      setEditing(false)
      setAdding(false)
    }
    onOpenChange(next)
  }

  const match = matchState?.result?.match ?? null
  const canBook = matchState?.result?.canBook ?? false
  const rated = matchState?.rated ?? {}

  // The session (in the caller's own store) behind this chat, if they host it.
  // A room chat maps to its room; a group — or a disbanded room's chat — to
  // the live match booked from it (mirrors `RoomsService#findChannelSessionDoc`).
  const linkedSession =
    (isRoom
      ? sessions.find((s) => s.id === channelId.slice("room-".length))
      : undefined) ??
    sessions.find(
      (s) => s.chatChannelId === channelId && s.status !== "cancelled"
    )

  // ── Rename ──
  const [editing, setEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState("")
  const [savingName, setSavingName] = React.useState(false)
  const startEditing = () => {
    setDraftName(name)
    setEditing(true)
  }
  const saveName = async () => {
    const next = draftName.trim()
    if (!next || next === name) {
      setEditing(false)
      return
    }
    setSavingName(true)
    try {
      await renameGroup(channelId, next)
      toast.success(t("renamed"))
      setEditing(false)
    } catch (err) {
      toast.error(t("renameFailed"), { description: errorText(err) })
    } finally {
      setSavingName(false)
    }
  }

  // ── Book a court for the group ──
  const book = () => {
    handleOpenChange(false)
    if (match) {
      // Only the host (who owns the session) is offered this; if their store
      // doesn't have it yet (e.g. a stale tab), don't spawn a second match.
      if (linkedSession) bookCourtForSession(linkedSession.id)
      else toast.error(t("bookUnavailable"))
      return
    }
    createGroupSession({
      channelId,
      title: name,
      members: memberList
        .filter((m) => memberId(m) !== currentUserId)
        .map((m) => ({
          id: memberId(m),
          name: m.user?.name ?? memberId(m),
        })),
    })
  }

  // ── Remove a member ──
  const [removing, setRemoving] = React.useState<ChannelMemberResponse | null>(
    null
  )
  const confirmRemove = async () => {
    const target = removing
    setRemoving(null)
    if (!target) return
    const id = memberId(target)
    // A real roster member of the linked session: kick through the session
    // store so the roster and the chat stay in step (it removes the chat
    // membership itself). Anyone else is a chat-only member.
    const entry = linkedSession?.roster.find((p) => p.userId === id)
    try {
      if (linkedSession && entry) kickPlayer(linkedSession.id, entry.initials)
      else await removeGroupMember(channelId, id)
      toast.success(t("removed", { name: target.user?.name ?? t("aMember") }))
    } catch (err) {
      toast.error(t("removeFailed"), { description: errorText(err) })
    }
  }

  // ── Rate a member ──
  const [rating, setRating] = React.useState<ChannelMemberResponse | null>(null)
  const iPlayed = Boolean(match?.participantIds.includes(currentUserId))
  const onRated = (rateeId: string, stars: number) => {
    setMatchState((prev) =>
      prev ? { ...prev, rated: { ...prev.rated, [rateeId]: stars } } : prev
    )
  }

  // ── Add members (community group owner) ──
  const [adding, setAdding] = React.useState(false)

  // ── Leave ──
  const roomId = isRoom ? channelId.slice("room-".length) : ""
  // The play room behind a room chat is still open and I'm in it (as host or
  // member). Once it's gone (cancelled), its chat is just a group chat.
  const roomActive = isRoom && joinedIds.has(roomId)
  const hostOfRoom = roomActive && isOwner
  // Leaving alone would only strand an empty chat — the last member left
  // deletes it instead.
  const lastMember = memberIds.length === 1 && memberIds[0] === currentUserId
  const [confirmLeave, setConfirmLeave] = React.useState(false)
  const leave = async () => {
    setConfirmLeave(false)
    try {
      if (roomActive) leaveRoom(roomId)
      else await leaveConversation(channelId)
      handleOpenChange(false)
      void setActiveChannel(undefined)
      showList()
      toast.success(t("left"))
    } catch (err) {
      toast.error(t("leaveFailed"), { description: errorText(err) })
    }
  }

  // ── Delete (community group owner, or the last member left) ──
  const canDelete = (isCommunity && isOwner) || lastMember
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const removeGroup = async () => {
    setDeleting(true)
    try {
      // A host alone in a still-open room cancels the room first (refund
      // and all) — deleting only its chat would leave a room with no chat.
      if (lastMember && hostOfRoom && !(await disbandOwnRoom(roomId))) return
      await deleteGroup(channelId)
      // A member somehow alone in an open room drops their seat too.
      if (lastMember && roomActive && !isOwner) leaveRoom(roomId)
      setConfirmDelete(false)
      handleOpenChange(false)
      void setActiveChannel(undefined)
      showList()
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteFailed"), { description: errorText(err) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="player-chat-dialog w-full gap-0 border-[var(--pc-border)] bg-[#f6f9ff] p-0 text-[var(--pc-ink)] sm:max-w-md"
        >
          <SheetHeader className="items-center gap-3 border-b border-[var(--pc-border)] bg-white px-6 pt-8 pb-5 text-center">
            <ChatAvatar
              name={name}
              className="size-20 ring-4 ring-[#a5ff12]/60"
              fallbackClassName="text-xl font-black"
            />
            {editing ? (
              <form
                className="flex w-full items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveName()
                }}
              >
                <Input
                  autoFocus
                  value={draftName}
                  maxLength={80}
                  onChange={(e) => setDraftName(e.target.value)}
                  aria-label={t("groupName")}
                  className="h-10 rounded-full border-[var(--pc-border)] bg-white px-4 text-center font-semibold"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={savingName || !draftName.trim()}
                  aria-label={t("save")}
                  className="shrink-0 rounded-full bg-[#2046ed] text-white hover:bg-[#173bc8]"
                >
                  {savingName ? <Spinner className="size-4" /> : <Check />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("cancel")}
                  onClick={() => setEditing(false)}
                  className="shrink-0 rounded-full"
                >
                  <X />
                </Button>
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <SheetTitle className="truncate font-heading text-xl font-black text-[var(--pc-ink)]">
                  {name}
                </SheetTitle>
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label={t("rename")}
                  title={t("rename")}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--pc-accent)] transition-colors hover:bg-[var(--pc-accent-soft)]"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
            )}
            <SheetDescription className="text-xs text-[var(--pc-muted)]">
              {t("membersCount", { count: memberList.length })}
            </SheetDescription>
          </SheetHeader>

          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Match / court */}
            <MatchCard
              loading={loadingMatch}
              failed={!loadingMatch && !matchState?.result}
              match={match}
              canBook={canBook}
              isHost={match ? match.hostUserId === currentUserId : false}
              onBook={book}
            />

            {/* Members */}
            <section className="rounded-3xl border border-[#eaf0fc] bg-white p-3 shadow-[0_3px_16px_#14205006]">
              <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-2">
                <h3 className="font-heading text-sm font-black">
                  {t("members")}
                </h3>
                {isCommunity && isOwner ? (
                  <button
                    type="button"
                    onClick={() => setAdding((v) => !v)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-[#a5ff12] px-3 text-[11px] font-bold text-[#2046ed] transition-colors hover:bg-[#a5ff12]/30"
                  >
                    <UserPlus className="size-3.5" />
                    {t("addMembers")}
                  </button>
                ) : null}
              </div>

              {adding ? (
                <AddMembersPanel
                  channelId={channelId}
                  existingIds={memberIds}
                  onDone={() => setAdding(false)}
                />
              ) : null}

              <ul className="flex flex-col">
                {memberList.map((m) => {
                  const id = memberId(m)
                  const me = id === currentUserId
                  const canRate =
                    Boolean(match?.ended) &&
                    iPlayed &&
                    !me &&
                    Boolean(match?.participantIds.includes(id))
                  const stars = rated[id]
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl px-1.5 py-2 transition-colors hover:bg-[#f6f9ff]"
                    >
                      <ChatAvatar
                        name={m.user?.name ?? id}
                        image={m.user?.image}
                        className="size-10 shrink-0"
                      >
                        {m.user?.online ? (
                          <AvatarBadge className="bg-[#22c55e]" />
                        ) : null}
                      </ChatAvatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {m.user?.name ?? id}
                          {me ? (
                            <span className="ml-1 font-medium text-[var(--pc-muted)]">
                              ({t("you")})
                            </span>
                          ) : null}
                        </p>
                        <p className="flex items-center gap-1 text-[11px] text-[var(--pc-muted)]">
                          {id === ownerId ? (
                            <>
                              <Crown className="size-3 text-[#f5b400]" />
                              {isRoom ? t("roomHost") : t("groupOwner")}
                            </>
                          ) : m.user?.online ? (
                            t("online")
                          ) : (
                            t("offline")
                          )}
                        </p>
                      </div>
                      {canRate ? (
                        stars ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[#fff7d6] px-2.5 py-1 text-[11px] font-bold text-[#8a5a00]"
                            title={t("ratedTitle")}
                          >
                            <Star className="size-3 fill-[#f5b400] text-[#f5b400]" />
                            {stars}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRating(m)}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#a5ff12] px-3 text-[11px] font-bold text-[#173bc8] transition-colors hover:bg-[#a5ff12]/80"
                          >
                            <Star className="size-3.5" />
                            {t("rate")}
                          </button>
                        )
                      ) : null}
                      {isOwner && !me ? (
                        <button
                          type="button"
                          onClick={() => setRemoving(m)}
                          aria-label={t("removeMember", {
                            name: m.user?.name ?? id,
                          })}
                          title={t("remove")}
                          className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--pc-muted)] transition-colors hover:bg-[#fdecec] hover:text-[#b42318]"
                        >
                          <UserMinus className="size-4" />
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>

            {match?.ended && iPlayed ? (
              <p className="px-2 text-center text-[11px] text-[var(--pc-muted)]">
                {t("rateHint")}
              </p>
            ) : null}

            {/* Leave / delete */}
            <section className="mt-auto flex flex-col gap-2">
              {lastMember ? null : (
                <button
                  type="button"
                  disabled={hostOfRoom}
                  onClick={() => setConfirmLeave(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-[#f6c9c9] bg-white px-4 py-3 text-sm font-bold text-[#b42318] transition-colors hover:bg-[#fdecec] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut className="size-4" />
                  {t("leave")}
                </button>
              )}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#b42318] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#912018]"
                >
                  <Trash2 className="size-4" />
                  {lastMember ? t("leaveAndDelete") : t("deleteGroup")}
                </button>
              ) : null}
              {lastMember ? (
                <p className="mt-2 text-center text-[11px] text-[var(--pc-muted)]">
                  {t("lastMemberHint")}
                </p>
              ) : hostOfRoom ? (
                <p className="mt-2 text-center text-[11px] text-[var(--pc-muted)]">
                  {t("hostCannotLeave")}
                </p>
              ) : null}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Remove confirm */}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent className="player-chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeTitle", { name: removing?.user?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmRemove()}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirm */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent className="player-chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveTitle", { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {roomActive ? t("leaveRoomBody") : t("leaveBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void leave()}
            >
              {t("leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => !deleting && setConfirmDelete(o)}
      >
        <AlertDialogContent className="player-chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lastMember
                ? t("leaveAndDeleteTitle", { name })
                : t("deleteTitle", { name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lastMember
                ? hostOfRoom
                  ? t("leaveAndDeleteRoomBody")
                  : t("leaveAndDeleteBody")
                : t("deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void removeGroup()}
            >
              {deleting ? <Spinner className="size-4" /> : <Trash2 />}
              {lastMember ? t("leaveAndDelete") : t("deleteGroup")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {match && rating ? (
        <RatingDialog
          member={rating}
          sessionId={match.sessionId}
          onClose={() => setRating(null)}
          onRated={onRated}
        />
      ) : null}
    </>
  )
}

function errorText(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined
}

/** The match card — book CTA when nothing is booked, else venue/time/status. */
function MatchCard({
  loading,
  failed,
  match,
  canBook,
  isHost,
  onBook,
}: {
  loading: boolean
  failed: boolean
  match: GroupMatch | null
  canBook: boolean
  isHost: boolean
  onBook: () => void
}) {
  const t = useTranslations("GroupInfo")

  if (loading) {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-[#eaf0fc] bg-white p-4">
        <Skeleton className="h-4 w-1/3 rounded-full" />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </section>
    )
  }

  if (failed) {
    return (
      <section className="rounded-3xl border border-dashed border-[#d6e0f7] bg-white px-4 py-5 text-center text-xs text-[var(--pc-muted)]">
        {t("matchUnavailable")}
      </section>
    )
  }

  // Not booked yet (no match at all, or a proposed one).
  if (!match || !match.booked) {
    return (
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#2046ed] p-5 text-white shadow-[0_10px_30px_#2046ed33]">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 -z-10 size-32 rounded-full border-[16px] border-[#a5ff12]/20"
        />
        <p className="text-[11px] font-bold tracking-[0.14em] text-[#a5ff12] uppercase">
          {t("matchTitle")}
        </p>
        <p className="mt-2 font-heading text-lg leading-snug font-black">
          {t("notBooked")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/80">
          {canBook ? t("notBookedHint") : t("waitHostBook")}
        </p>
        {canBook ? (
          <button
            type="button"
            onClick={onBook}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#a5ff12] px-5 text-xs font-bold text-[#173bc8] transition-colors hover:bg-white"
          >
            <CalendarDays className="size-4" />
            {t("bookForGroup")}
          </button>
        ) : null}
      </section>
    )
  }

  const [y, mo, d] = match.dayKey.split("-")
  const endAt = match.slot
    ? addMinutesHHMM(match.slot, match.durationMin)
    : null
  const status = match.ended
    ? { label: t("statusPlayed"), cls: "bg-[#eef1f6] text-[#596783]" }
    : match.paymentStatus === "awaiting"
      ? {
          label: t("statusAwaitingPayment"),
          cls: "bg-[#fff4d6] text-[#8a5a00]",
        }
      : match.hold === "pending"
        ? {
            label: t("statusPendingApproval"),
            cls: "bg-[#fff4d6] text-[#8a5a00]",
          }
        : { label: t("statusConfirmed"), cls: "bg-[#2046ed] text-white" }

  return (
    <section className="rounded-3xl border border-[#eaf0fc] bg-white p-4 shadow-[0_3px_16px_#14205006]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[#596783] uppercase">
          {t("matchTitle")}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            status.cls
          )}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-[#2046ed] py-2 text-white">
          <span className="text-[10px] font-semibold opacity-80">
            {mo}/{y?.slice(2)}
          </span>
          <span className="font-heading text-2xl leading-none font-black text-[#a5ff12] tabular-nums">
            {Number(d) || "—"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-black">
            {match.venue || match.title}
          </p>
          {match.courtLabel ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--pc-muted)]">
              <MapPin className="size-3.5 shrink-0 text-[#2046ed]" />
              {courtText(match.courtLabel, (n) => t("court", { n }))}
            </p>
          ) : null}
          {match.slot ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--pc-muted)] tabular-nums">
              <Clock className="size-3.5 shrink-0 text-[#2046ed]" />
              {match.slot}
              {endAt ? ` – ${endAt}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      {isHost && match.paymentStatus === "awaiting" && !match.ended ? (
        <button
          type="button"
          onClick={onBook}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#a5ff12] text-xs font-bold text-[#173bc8] transition-colors hover:bg-[#a5ff12]/80"
        >
          <CreditCard className="size-4" />
          {t("continuePayment")}
        </button>
      ) : null}
    </section>
  )
}

/** "Sân 3" for a seeded "Court 3", else the stored label as-is. */
function courtText(label: string, localized: (n: string) => string): string {
  const n = label.match(/^Court (\d+)$/)?.[1]
  return n ? localized(n) : label
}

/** "HH:MM" + minutes → "HH:MM" (wraps past midnight). */
function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = ((h || 0) * 60 + (m || 0) + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`
}

/** Inline user search to add real users to a community group (owner only). */
function AddMembersPanel({
  channelId,
  existingIds,
  onDone,
}: {
  channelId: string
  existingIds: string[]
  onDone: () => void
}) {
  const t = useTranslations("GroupInfo")
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<FoundUser[]>([])
  const [searching, setSearching] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const trimmed = query.trim()
    let cancelled = false
    // Everything runs in the deferred callback so the effect body never sets
    // state synchronously (repo lint rule).
    const timer = setTimeout(() => {
      if (cancelled) return
      if (trimmed.length < MIN_QUERY_LEN) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      searchUsers(trimmed)
        .then((found) => {
          if (!cancelled) setResults(found)
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const add = async (user: FoundUser) => {
    setAddingId(user.id)
    try {
      await addGroupMembers(channelId, [user.id])
      toast.success(t("added", { name: user.name }))
      setResults((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      toast.error(t("addFailed"), { description: errorText(err) })
    } finally {
      setAddingId(null)
    }
  }

  const fresh = results.filter((u) => !existingIds.includes(u.id))

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-2xl bg-[#f6f9ff] p-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--pc-muted)]" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-10 rounded-full border-[var(--pc-border)] bg-white pr-10 pl-9 text-xs"
        />
        <button
          type="button"
          onClick={onDone}
          aria-label={t("cancel")}
          className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--pc-muted)] hover:text-[var(--pc-ink)]"
        >
          <X className="size-4" />
        </button>
      </div>
      {searching ? (
        <div className="flex justify-center py-2">
          <Spinner className="size-4" />
        </div>
      ) : query.trim().length >= MIN_QUERY_LEN && !fresh.length ? (
        <p className="py-2 text-center text-[11px] text-[var(--pc-muted)]">
          {t("noResults")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {fresh.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 px-1 py-1.5">
              <ChatAvatar
                name={u.name}
                image={u.image}
                className="size-8 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{u.name}</p>
                {u.email ? (
                  <p className="truncate text-[10px] text-[var(--pc-muted)]">
                    {u.email}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={addingId !== null}
                onClick={() => void add(u)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#2046ed] px-3 text-[11px] font-bold text-white transition-colors hover:bg-[#173bc8] disabled:opacity-60"
              >
                {addingId === u.id ? (
                  <Spinner className="size-3" />
                ) : (
                  <UserPlus className="size-3" />
                )}
                {t("add")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 1–5 stars + optional comment for a fellow player of a finished match. */
function RatingDialog({
  member,
  sessionId,
  onClose,
  onRated,
}: {
  member: ChannelMemberResponse
  sessionId: string
  onClose: () => void
  onRated: (rateeId: string, stars: number) => void
}) {
  const t = useTranslations("GroupInfo")
  const id = memberId(member)
  const memberName = member.user?.name ?? id
  const [stars, setStars] = React.useState(0)
  const [hover, setHover] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const [sending, setSending] = React.useState(false)

  const submit = async () => {
    if (!stars) return
    setSending(true)
    try {
      await ratePlayer({
        sessionId,
        rateeId: id,
        stars,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      })
      onRated(id, stars)
      toast.success(t("ratedToast", { name: memberName }))
      onClose()
    } catch (err) {
      toast.error(t("rateFailed"), { description: errorText(err) })
      setSending(false)
    }
  }

  const shown = hover || stars

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="player-chat-dialog border-[var(--pc-border)] bg-white text-[var(--pc-ink)] sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <ChatAvatar
            name={memberName}
            image={member.user?.image}
            className="size-16"
          />
          <DialogTitle className="mt-2 font-heading text-lg font-black text-[var(--pc-ink)]">
            {t("rateTitle", { name: memberName })}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--pc-muted)]">
            {t("rateDescription")}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex justify-center gap-1.5"
          role="radiogroup"
          aria-label={t("starsLabel")}
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={t("starsValue", { count: n })}
              onMouseEnter={() => setHover(n)}
              onClick={() => setStars(n)}
              className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[#2046ed]"
            >
              <Star
                className={cn(
                  "size-9",
                  n <= shown
                    ? "fill-[#f5b400] text-[#f5b400]"
                    : "text-[#d6e0f7]"
                )}
              />
            </button>
          ))}
        </div>
        <p className="h-4 text-center text-xs font-semibold text-[#8a5a00]">
          {shown ? t(`starWords.${shown}`) : ""}
        </p>

        <Textarea
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("commentPlaceholder")}
          aria-label={t("commentPlaceholder")}
          className="min-h-20 rounded-2xl border-[var(--pc-border)] text-sm"
        />

        <DialogFooter className="gap-2 sm:flex-row">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={onClose}
            disabled={sending}
          >
            {t("cancel")}
          </Button>
          <Button
            className="rounded-full bg-[#2046ed] font-bold text-white hover:bg-[#173bc8]"
            disabled={!stars || sending}
            onClick={() => void submit()}
          >
            {sending ? <Spinner className="size-4" /> : <Star />}
            {t("submitRating")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
