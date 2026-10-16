"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  Copy,
  ImagePlus,
  Loader2,
  MessageCircle,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Link, useRouter } from "@/i18n/navigation"
import {
  EMPTY_PAYOUT,
  isPayoutValid,
  normalizeAccountNo,
  toBankAccountName,
  type PayoutDraft,
} from "@/lib/bank-account"
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  uploadToCloudinary,
} from "@/lib/cloudinary-upload"
import { formatVndFull, slotRange } from "@/lib/shared"
import { openVenueChat } from "@/features/chat/stream-actions"
import {
  signPaymentProofUpload,
  startVietQrPayment,
  submitPaymentProof,
  type VietQrPayment,
} from "@/features/play/payment-actions"
import { PayoutFields } from "@/features/venue/payout-fields"

type Screen =
  | { kind: "loading" }
  | { kind: "ready"; pay: VietQrPayment }
  | { kind: "error"; message: string }
  | { kind: "sent"; venueId: string | null }

const CARD =
  "rounded-3xl border border-[#eaf0fc] bg-white p-5 shadow-[0_3px_16px_#14205006]"

/** One labelled value with a copy button — the transfer details the player re-types. */
function CopyRow({
  label,
  value,
  display,
}: {
  label: string
  value: string
  display?: string
}) {
  const t = useTranslations("PaymentVietQr")
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => toast.error(t("copyFailed")))
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eaf0fc] py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-base font-semibold break-all text-[#0b1224]">
          {display ?? value}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        onClick={copy}
        aria-label={`${t("copy")} ${label}`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  )
}

/**
 * Pay a booking by bank transfer: the venue's QR + account + a unique memo, then
 * the player's own refund account and a screenshot of the transfer. The booking
 * is only sent to the venue when the screenshot is submitted.
 */
export function PaymentScreen({
  bookingId,
  discountCode,
}: {
  bookingId: string
  discountCode?: string
}) {
  const t = useTranslations("PaymentVietQr")
  const router = useRouter()
  const [screen, setScreen] = React.useState<Screen>({ kind: "loading" })
  const [refund, setRefund] = React.useState<PayoutDraft>(EMPTY_PAYOUT)
  const [file, setFile] = React.useState<File | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false
    void startVietQrPayment(bookingId, discountCode).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setScreen({ kind: "error", message: result.message })
        return
      }
      const saved = result.data.refundAccount
      if (saved) {
        setRefund({
          bankBin: saved.bankBin,
          accountNo: saved.accountNo,
          accountName: saved.accountName,
        })
      }
      setScreen({ kind: "ready", pay: result.data })
    })
    return () => {
      cancelled = true
    }
  }, [bookingId, discountCode])

  // A blob URL derived from the chosen file, released when it is replaced.
  const preview = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  )
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )

  const onFile = (list: FileList | null) => {
    const picked = list?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!picked) return
    if (!IMAGE_ACCEPT.split(",").includes(picked.type)) {
      toast.error(t("fileType"))
      return
    }
    if (picked.size > IMAGE_MAX_BYTES) {
      toast.error(t("fileSize", { mb: IMAGE_MAX_BYTES / 1024 / 1024 }))
      return
    }
    setFile(picked)
  }

  const canSubmit = isPayoutValid(refund) && file !== null && !submitting

  const submit = async () => {
    if (!file || !isPayoutValid(refund) || screen.kind !== "ready") return
    setSubmitting(true)
    try {
      const sig = await signPaymentProofUpload(bookingId)
      if (!sig.ok) {
        toast.error(sig.message)
        return
      }
      const proofUrl = await uploadToCloudinary(file, sig.data)
      const result = await submitPaymentProof(bookingId, {
        proofUrl,
        refundAccount: {
          bankBin: refund.bankBin,
          accountNo: normalizeAccountNo(refund.accountNo),
          accountName: toBankAccountName(refund.accountName),
        },
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setScreen({ kind: "sent", venueId: screen.pay.venueId })
      router.refresh()
    } catch {
      toast.error(t("submitFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const [opening, startOpening] = React.useTransition()
  const messageVenue = () => {
    startOpening(async () => {
      try {
        const { id } = await openVenueChat({ bookingId })
        router.push(`/app/chat?channel=${id}`)
      } catch {
        toast.error(t("chatFailed"))
      }
    })
  }

  if (screen.kind === "loading") {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (screen.kind === "error") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{screen.message}</p>
        <Button
          className="rounded-full"
          render={<Link href="/app/bookings" />}
          nativeButton={false}
        >
          {t("toBookings")}
        </Button>
      </div>
    )
  }

  if (screen.kind === "sent") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-brand/10 text-brand">
          <Check className="size-7" />
        </div>
        <h1 className="font-heading text-2xl font-black">{t("sentTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("sentBody")}</p>
        <p className="rounded-2xl bg-[#f4f7fc] px-4 py-3 text-xs text-muted-foreground">
          {t("sentNudge")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            className="rounded-full"
            render={<Link href="/app/bookings" />}
            nativeButton={false}
          >
            {t("toBookings")}
          </Button>
          {screen.venueId ? (
            <Button
              variant="outline"
              className="rounded-full"
              disabled={opening}
              onClick={() => messageVenue()}
            >
              <MessageCircle className="size-4" />
              {t("messageVenue")}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const { pay } = screen
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-xs text-muted-foreground">
          {pay.courtName} · {pay.dateKey} ·{" "}
          {slotRange(pay.start, pay.durationMin)}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cn(CARD, "flex flex-col gap-4")}>
          <h2 className="text-base font-semibold">{t("step1")}</h2>
          <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-[#eaf0fc] bg-white p-2">
            {/* The QR is VietQR's own image; it is not an asset we can optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pay.qrUrl}
              alt={t("qrAlt")}
              className="h-auto w-full"
              width={260}
              height={260}
            />
          </div>
          <div className="flex flex-col">
            <CopyRow label={t("bank")} value={pay.account.bankName} />
            <CopyRow label={t("accountNo")} value={pay.account.accountNo} />
            <CopyRow label={t("accountName")} value={pay.account.accountName} />
            <CopyRow
              label={t("amount")}
              value={String(pay.amount)}
              display={formatVndFull(pay.amount)}
            />
            <CopyRow label={t("memo")} value={pay.transferMemo} />
          </div>
          {pay.discountCode ? (
            <p className="rounded-2xl bg-brand/8 px-3.5 py-2.5 text-xs text-brand">
              {t("discountApplied", {
                code: pay.discountCode,
                amount: formatVndFull(pay.discountAmount ?? 0),
              })}
            </p>
          ) : null}
          <p className="rounded-2xl bg-[#fff7e6] px-3.5 py-2.5 text-xs text-[#7a5200]">
            {t("memoWarning")}
          </p>
        </section>

        <section className={cn(CARD, "flex flex-col gap-5")}>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{t("step2")}</h2>
            <p className="text-xs text-muted-foreground">{t("proofHint")}</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => onFile(e.target.files)}
          />
          {preview ? (
            <div className="flex flex-col items-start gap-2">
              {/* A local blob URL of the player's own screenshot. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={t("proofAlt")}
                className="max-h-64 w-auto rounded-2xl border border-[#eaf0fc]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => inputRef.current?.click()}
              >
                {t("changeImage")}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c9d6f5] text-sm text-muted-foreground transition-colors hover:bg-[#f4f7fc]"
            >
              <ImagePlus className="size-6" />
              {t("pickImage")}
            </button>
          )}

          <div className="flex flex-col gap-3 border-t border-[#eaf0fc] pt-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t("refundTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("refundHint")}</p>
            </div>
            <PayoutFields
              value={refund}
              onChange={setRefund}
              idPrefix="refund-account"
            />
          </div>

          <Button
            className="h-11 rounded-full text-base"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                {t("submitting")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("venueChecks")}
          </p>
        </section>
      </div>
    </div>
  )
}
