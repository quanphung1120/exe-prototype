"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Banknote, Check, Copy, Upload, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

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
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  uploadToCloudinary,
} from "@/lib/cloudinary-upload"
import { formatVndText } from "@/lib/money"
import { locStr, type RefundQueueItem, type Reservation } from "@/lib/shared"
import {
  completeRefund,
  signRefundProofUpload,
} from "@/features/play/payment-actions"
import { VenuePanel } from "@/features/venue/shared"

/** "HH:mm dd/MM" from an ISO datetime (+07:00 wall clock). */
function shortStamp(iso: string): string {
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/**
 * The venue's view of a player's transfer screenshot: the amount and memo to
 * look for in the bank app, the image itself, and the approve / reject choice.
 */
export function PaymentProofDialog({
  reservation: r,
  onOpenChange,
  onApprove,
  onReject,
}: {
  reservation: Reservation | null
  onOpenChange: (open: boolean) => void
  onApprove: (r: Reservation) => void
  onReject: (r: Reservation) => void
}) {
  const t = useTranslations("VenuePaymentReview")
  return (
    <Dialog open={r !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: r?.customer.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        {r ? (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">{t("amount")}</dt>
              <dd className="text-right font-mono font-semibold tabular-nums">
                {formatVndText(r.amountDue ?? r.price)}
              </dd>
              {r.transferMemo ? (
                <>
                  <dt className="text-muted-foreground">{t("memo")}</dt>
                  <dd className="text-right font-mono font-semibold">
                    {r.transferMemo}
                  </dd>
                </>
              ) : null}
              {r.answerDeadlineAt ? (
                <>
                  <dt className="text-muted-foreground">{t("deadline")}</dt>
                  <dd className="text-right tabular-nums">
                    {shortStamp(r.answerDeadlineAt)}
                  </dd>
                </>
              ) : null}
            </dl>
            {r.paymentProofUrl ? (
              <a href={r.paymentProofUrl} target="_blank" rel="noreferrer">
                {/* A player-uploaded Cloudinary screenshot. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.paymentProofUrl}
                  alt={t("proofAlt")}
                  className="max-h-96 w-full rounded-2xl border object-contain"
                />
              </a>
            ) : (
              <p className="rounded-2xl bg-muted/50 px-3 py-2 text-muted-foreground">
                {t("noProof")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => r && onReject(r)}
          >
            <X />
            {t("reject")}
          </Button>
          <Button className="rounded-full" onClick={() => r && onApprove(r)}>
            <Check />
            {t("approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Bookings the venue rejected or cancelled: it owes each player a manual bank
 * transfer. Shows the player's account (and a QR pre-filled with the refund),
 * and takes the transfer screenshot that closes the refund.
 */
export function RefundQueuePanel({ items }: { items: RefundQueueItem[] }) {
  const t = useTranslations("VenuePaymentReview.refund")
  const locale = useLocale()
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const targetRef = React.useRef<RefundQueueItem | null>(null)
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set())
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [amounts, setAmounts] = React.useState<Record<string, string>>({})

  const open = items.filter((i) => !done.has(i.bookingId))
  if (open.length === 0) return null

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      toast.success(t("copied"))
    })
  }

  const submit = async (item: RefundQueueItem, file: File) => {
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error(t("tooBig"))
      return
    }
    setBusyId(item.bookingId)
    try {
      const sig = await signRefundProofUpload(item.bookingId)
      if (!sig.ok) {
        toast.error(sig.message)
        return
      }
      const proofUrl = await uploadToCloudinary(file, sig.data)
      const typed = Number((amounts[item.bookingId] ?? "").replace(/\D/g, ""))
      const result = await completeRefund(item.bookingId, {
        proofUrl,
        ...(typed > 0 && typed !== item.refund.amount ? { amount: typed } : {}),
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setDone((prev) => new Set(prev).add(item.bookingId))
      toast.success(t("done"))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <VenuePanel title={t("title")} icon={Banknote}>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          const item = targetRef.current
          e.target.value = ""
          if (file && item) void submit(item, file)
        }}
      />
      <p className="-mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <ul className="flex flex-col divide-y divide-border">
        {open.map((item) => (
          <li
            key={item.bookingId}
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row"
          >
            {item.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.qrUrl}
                alt={t("qrAlt")}
                className="size-36 shrink-0 rounded-2xl border bg-white object-contain"
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              <div>
                <p className="font-medium">{item.customer.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.court} · {locStr(item.day, locale)} · {item.time}
                </p>
              </div>
              {item.refundAccount ? (
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono">
                    {item.refundAccount.bankCode} ·{" "}
                    {item.refundAccount.accountNo} ·{" "}
                    {item.refundAccount.accountName}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => copy(item.refundAccount!.accountNo)}
                  >
                    <Copy className="size-3" />
                    {t("copyAccount")}
                  </button>
                </p>
              ) : (
                <p className="text-xs text-amber-600">{t("noAccount")}</p>
              )}
              <p className="font-mono font-semibold tabular-nums">
                {formatVndText(item.refund.amount)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({t("pct", { pct: item.refund.pct })})
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  inputMode="numeric"
                  placeholder={t("amountPlaceholder")}
                  className="h-8 w-40"
                  value={amounts[item.bookingId] ?? ""}
                  onChange={(e) =>
                    setAmounts((prev) => ({
                      ...prev,
                      [item.bookingId]: e.target.value,
                    }))
                  }
                />
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busyId === item.bookingId}
                  onClick={() => {
                    targetRef.current = item
                    inputRef.current?.click()
                  }}
                >
                  <Upload />
                  {busyId === item.bookingId ? t("uploading") : t("upload")}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </VenuePanel>
  )
}
