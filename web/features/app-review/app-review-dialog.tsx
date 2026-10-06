"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Star } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { MyAppReview } from "@/lib/shared"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  getMyAppReview,
  saveAppReview,
} from "@/features/app-review/app-review-actions"

/** Mirrors the api's `APP_REVIEW_COMMENT_MAX` (app-reviews.dto.ts). */
const COMMENT_MAX = 500

/**
 * "Rate the app" dialog, opened from the account menus. Each user has one
 * review — opening it again loads and edits the saved one. Featured reviews
 * (4★+ with a comment) are quoted on the landing page, which the dialog says
 * up front.
 */
export function AppReviewDialog({
  open,
  onOpenChange,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Theme scope for the portaled popup (e.g. the player header's). */
  className?: string
}) {
  const t = useTranslations("AppReview")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open re-reads the saved review. */}
        {open ? <ReviewForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ReviewForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("AppReview")
  const [existing, setExisting] = React.useState<MyAppReview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [rating, setRating] = React.useState(0)
  const [hover, setHover] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const [saving, startSaving] = React.useTransition()

  React.useEffect(() => {
    let active = true
    getMyAppReview()
      .then((review) => {
        if (!active || !review) return
        setExisting(review)
        setRating(review.rating)
        setComment(review.comment)
      })
      .catch(() => {
        // A failed load just starts a fresh review; saving still upserts.
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (rating < 1) return
    startSaving(async () => {
      try {
        await saveAppReview({ rating, comment: comment.trim() })
        toast.success(existing ? t("updated") : t("thanks"))
        onDone()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveFailed"))
      }
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const shown = hover || rating
  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="flex flex-col items-center gap-2">
        <div
          role="radiogroup"
          aria-label={t("ratingLabel")}
          className="flex gap-1"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={t("starLabel", { count: value })}
              className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onMouseEnter={() => setHover(value)}
              onClick={() => setRating(value)}
            >
              <Star
                className={cn(
                  "size-8 transition-colors",
                  value <= shown
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </div>
        <p className="h-4 text-xs text-muted-foreground">
          {shown ? t(`levels.${shown}`) : t("pickStars")}
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("commentLabel")}
        <Textarea
          value={comment}
          maxLength={COMMENT_MAX}
          rows={4}
          placeholder={t("commentPlaceholder")}
          onChange={(e) => setComment(e.target.value)}
        />
        <span className="self-end text-xs font-normal text-muted-foreground tabular-nums">
          {comment.length}/{COMMENT_MAX}
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        {existing?.hidden ? t("hiddenNotice") : t("publicNotice")}
      </p>

      <DialogFooter>
        <Button
          type="submit"
          className="rounded-full"
          disabled={rating < 1 || saving}
        >
          {saving ? <Spinner /> : null}
          {existing ? t("update") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  )
}
