"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Loader2, MessageSquareWarning } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { fileCancelComplaint } from "@/features/play/booking-actions"

/**
 * Shown on a booking whose venue refused a cancel request made ≥ 24h before
 * the start (the policy only lets it do that for a good reason): the player can
 * take it to the platform, where an admin may overturn it with a full refund.
 */
export function CancelComplaintButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("CancelComplaint")
  const [open, setOpen] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState("")

  const submit = () => {
    if (busy) return
    setBusy(true)
    void (async () => {
      const result = await fileCancelComplaint(bookingId, reason)
      setBusy(false)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t("sent"))
      setSent(true)
      setOpen(false)
      setReason("")
    })()
  }

  if (sent) {
    return <p className="text-xs text-muted-foreground">{t("sentNote")}</p>
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="self-start rounded-full"
        onClick={() => setOpen(true)}
      >
        <MessageSquareWarning />
        {t("button")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            maxLength={500}
            rows={4}
            placeholder={t("placeholder")}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button
              disabled={reason.trim().length < 10 || busy}
              onClick={submit}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("send")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
