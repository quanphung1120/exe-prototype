"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  Clock,
  Loader2,
  MessageSquareWarning,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { Link, useRouter } from "@/i18n/navigation"
import { formatVndFull } from "@/features/dashboard/data"
import { ROOMS_CHANGED_EVENT, useSession } from "@/features/play/session"
import {
  decideLeaveRequest,
  fileRoomComplaint,
  getDueShares,
  getRoomShares,
  payRoomShare,
} from "@/features/play/room-share-actions"
import { getWallet } from "@/features/wallet/wallet-actions"
import type { DueRoomShare, RoomSharesInfo } from "@/lib/shared"

const DUE_POLL_MS = 30_000

/** The player's wallet balance, loaded while `active` (null until known). */
function useWalletBalance(active: boolean): number | null {
  const [balance, setBalance] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!active) return
    let cancelled = false
    void getWallet().then((result) => {
      if (!cancelled && result.ok) setBalance(result.data.balance)
    })
    return () => {
      cancelled = true
    }
  }, [active])
  return balance
}

/**
 * Asking to join a room whose court the host already paid for costs the seat's
 * share (court price ÷ max players). It is taken from the wallet with the
 * request, held until the host answers, and returned if they decline.
 */
export function RoomShareJoinDialog() {
  const t = useTranslations("RoomShare")
  const { shareJoinRoom, confirmShareJoin, dismissShareJoin } = useSession()
  const balance = useWalletBalance(shareJoinRoom != null)
  const amount = shareJoinRoom?.sharePrice ?? 0
  const short = balance != null && balance < amount

  return (
    <AlertDialog
      open={shareJoinRoom != null}
      onOpenChange={(open) => {
        if (!open) dismissShareJoin()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("joinTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("joinBody", {
              amount: formatVndFull(amount),
              capacity: shareJoinRoom?.capacity ?? 0,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t("yourShare")}</span>
            <span className="font-semibold tabular-nums">
              {formatVndFull(amount)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Wallet className="size-3.5" />
              {t("walletBalance")}
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                short && "text-destructive"
              )}
            >
              {balance == null ? "…" : formatVndFull(balance)}
            </span>
          </div>
          {short ? (
            <p className="text-xs text-destructive">
              {t("short", { missing: formatVndFull(amount - balance) })}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("refundNote")}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          {short ? (
            <Link
              href="/app/wallet"
              onClick={dismissShareJoin}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {t("topUp")}
            </Link>
          ) : (
            <AlertDialogAction
              disabled={balance == null}
              onClick={confirmShareJoin}
            >
              {t("confirmJoin", { amount: formatVndFull(amount) })}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Floating reminder for every room whose host has paid for the court but the
 * player (a confirmed member) hasn't covered their seat yet. Pays from the
 * wallet into the host's; a short balance points at the top-up page.
 */
export function DueSharesBanner() {
  const t = useTranslations("RoomShare")
  const router = useRouter()
  const [due, setDue] = React.useState<DueRoomShare[]>([])
  const [payingId, setPayingId] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    const result = await getDueShares()
    if (result.ok) setDue(result.data)
  }, [])

  React.useEffect(() => {
    const first = setTimeout(() => void refresh(), 0)
    const id = setInterval(() => void refresh(), DUE_POLL_MS)
    const onChange = () => void refresh()
    window.addEventListener(ROOMS_CHANGED_EVENT, onChange)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      window.removeEventListener(ROOMS_CHANGED_EVENT, onChange)
    }
  }, [refresh])

  if (!due.length) return null

  const pay = (share: DueRoomShare) => {
    if (payingId) return
    setPayingId(share.roomId)
    void (async () => {
      const result = await payRoomShare(share.roomId)
      setPayingId(null)
      if (!result.ok) {
        if (result.status === 402) {
          toast.error(result.message, {
            action: {
              label: t("topUp"),
              onClick: () => router.push("/app/wallet"),
            },
          })
        } else {
          toast.error(result.message)
        }
        void refresh()
        return
      }
      toast.success(t("paidToast", { amount: formatVndFull(share.amount) }))
      setDue((prev) => prev.filter((d) => d.roomId !== share.roomId))
      window.dispatchEvent(new Event(ROOMS_CHANGED_EVENT))
    })()
  }

  return (
    <div
      role="region"
      aria-label={t("dueTitle")}
      className="fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {due.map((share) => (
        <div
          key={share.roomId}
          className="flex flex-col gap-3 rounded-3xl border bg-card p-4 shadow-lg"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">{t("dueTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("dueBody", {
                host: share.hostName,
                room: share.title,
                amount: formatVndFull(share.amount),
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="rounded-full"
              disabled={payingId != null}
              onClick={() => pay(share)}
            >
              {payingId === share.roomId ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wallet />
              )}
              {t("payShare", { amount: formatVndFull(share.amount) })}
            </Button>
            <Link
              href="/app/wallet"
              className="text-xs font-medium text-brand hover:underline"
            >
              {t("topUp")}
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Inside a booked room's detail: the per-seat share and who has covered it.
 * Shown to the host and every member. A member who has paid can only leave with
 * the host's approval (which refunds them), so this is also where the host
 * answers leave requests and where a refused member files a complaint.
 */
export function RoomSharePanel({
  roomId,
  isHost,
}: {
  roomId: string
  isHost: boolean
}) {
  const t = useTranslations("RoomShare")
  const me = useAuthUser()
  const [info, setInfo] = React.useState<RoomSharesInfo | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [complaining, setComplaining] = React.useState(false)
  const [reason, setReason] = React.useState("")

  const load = React.useCallback(async () => {
    const result = await getRoomShares(roomId)
    if (result.ok) setInfo(result.data)
  }, [roomId])

  React.useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const onChange = () => void load()
    window.addEventListener(ROOMS_CHANGED_EVENT, onChange)
    return () => {
      clearTimeout(first)
      window.removeEventListener(ROOMS_CHANGED_EVENT, onChange)
    }
  }, [load])

  if (!info || info.amount === 0) return null

  const decide = (userId: string, decision: "approve" | "decline") => {
    if (busyId) return
    setBusyId(userId)
    void (async () => {
      const result = await decideLeaveRequest(roomId, userId, decision)
      setBusyId(null)
      if (!result.ok) {
        toast.error(result.message, {
          action:
            result.status === 402
              ? {
                  label: t("topUp"),
                  onClick: () => window.location.assign("/app/wallet"),
                }
              : undefined,
        })
        return
      }
      toast.success(
        decision === "approve" ? t("leaveApproved") : t("leaveDeclined")
      )
      window.dispatchEvent(new Event(ROOMS_CHANGED_EVENT))
      void load()
    })()
  }

  const submitComplaint = () => {
    if (busyId) return
    setBusyId("complaint")
    void (async () => {
      const result = await fileRoomComplaint(roomId, reason)
      setBusyId(null)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t("complaintSent"))
      setComplaining(false)
      setReason("")
      void load()
    })()
  }

  const mine = info.members.find((m) => m.userId === me.id)

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{t("perSeat")}</span>
        <span className="font-semibold tabular-nums">
          {formatVndFull(info.amount)}
        </span>
      </div>
      {info.members.length ? (
        <ul className="flex flex-col gap-2">
          {info.members.map((m) => {
            const paid = m.status === "paid"
            return (
              <li key={m.userId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{m.name}</span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 font-medium",
                      paid
                        ? "text-emerald-600"
                        : m.status === "held"
                          ? "text-muted-foreground"
                          : "text-amber-600"
                    )}
                  >
                    {paid ? (
                      <Check className="size-3" />
                    ) : (
                      <Clock className="size-3" />
                    )}
                    {t(`status.${m.status}`)}
                  </span>
                </div>
                {m.leave === "pending" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <span>
                      {isHost
                        ? t("leavePendingHost", { name: m.name })
                        : m.userId === me.id
                          ? t("leavePendingMine")
                          : t("leavePendingOther")}
                    </span>
                    {isHost ? (
                      <span className="flex items-center gap-1.5">
                        <Button
                          size="xs"
                          className="rounded-full"
                          disabled={busyId != null}
                          onClick={() => decide(m.userId, "approve")}
                        >
                          {busyId === m.userId ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          {t("approveLeave", {
                            amount: formatVndFull(info.amount),
                          })}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="rounded-full"
                          disabled={busyId != null}
                          onClick={() => decide(m.userId, "decline")}
                        >
                          {t("declineLeave")}
                        </Button>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {m.leave === "rejected" ? (
                  <p className="rounded-xl bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    {m.userId === me.id
                      ? t("leaveRejectedMine")
                      : t("leaveRejected", { name: m.name })}
                  </p>
                ) : null}
                {m.complaint ? (
                  <p className="text-xs text-muted-foreground">
                    {t(`complaintStatus.${m.complaint}`)}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {mine && mine.status === "paid" && !mine.leave ? (
        <p className="text-xs text-muted-foreground">
          {t("leaveNeedsApproval")}
        </p>
      ) : null}
      {mine &&
      mine.status === "paid" &&
      mine.leave &&
      mine.complaint !== "open" ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start rounded-full"
          onClick={() => setComplaining(true)}
        >
          <MessageSquareWarning />
          {t("complain")}
        </Button>
      ) : null}

      <AlertDialog open={complaining} onOpenChange={setComplaining}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("complaintTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("complaintBody", { amount: formatVndFull(info.amount) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            maxLength={500}
            rows={4}
            placeholder={t("complaintPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button
              disabled={reason.trim().length < 10 || busyId != null}
              onClick={submitComplaint}
            >
              {busyId === "complaint" ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {t("sendComplaint")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
