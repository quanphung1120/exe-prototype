"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { Eye, EyeOff, Star } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { AdminAppReviewRow } from "@/lib/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/pagination"
import { setAppReviewHidden } from "@/features/admin/admin-actions"
import { VenueEmpty, VenuePanel } from "@/features/venue/shared"

/**
 * Moderation list for app reviews. Every review is listed; visible 4★+
 * reviews with enough text are what the landing page quotes, so hiding one
 * here takes it off the landing (and out of the average) immediately.
 */
export function AdminAppReviewsView({
  reviews,
}: {
  reviews: AdminAppReviewRow[]
}) {
  const t = useTranslations("AdminAppReviews")
  const locale = useLocale()
  const [rows, setRows] = React.useState(reviews)
  const [pending, setPending] = React.useState<string | null>(null)
  const pagination = useAdminPagination(rows.length)

  const toggle = async (row: AdminAppReviewRow) => {
    setPending(row.userId)
    try {
      await setAppReviewHidden(row.userId, !row.hidden)
      setRows((current) =>
        current.map((r) =>
          r.userId === row.userId ? { ...r, hidden: !row.hidden } : r
        )
      )
      toast.success(row.hidden ? t("shown") : t("hiddenToast"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"))
    } finally {
      setPending(null)
    }
  }

  const dateFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <VenuePanel title={t("listTitle", { count: rows.length })}>
          <ul className="flex flex-col divide-y divide-border">
            {rows
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0",
                    row.hidden && "opacity-60"
                  )}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {row.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{row.authorName}</p>
                        <span
                          className="flex text-amber-400"
                          aria-label={t("ratingAria", { rating: row.rating })}
                        >
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              aria-hidden
                              className={cn(
                                "size-3.5",
                                s <= row.rating
                                  ? "fill-current"
                                  : "text-muted-foreground/40"
                              )}
                            />
                          ))}
                        </span>
                        <Badge variant="secondary">
                          {t(`role.${row.role}`)}
                        </Badge>
                        {row.hidden ? (
                          <Badge variant="outline">{t("hiddenBadge")}</Badge>
                        ) : null}
                      </div>
                      {row.comment ? (
                        <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
                          {row.comment}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground italic">
                          {t("noComment")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateFmt.format(new Date(row.updatedAt))}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={pending === row.userId}
                    onClick={() => void toggle(row)}
                  >
                    {row.hidden ? <Eye /> : <EyeOff />}
                    {row.hidden ? t("show") : t("hide")}
                  </Button>
                </li>
              ))}
          </ul>
        </VenuePanel>
      )}

      <AdminPagination pagination={pagination} />
    </div>
  )
}
