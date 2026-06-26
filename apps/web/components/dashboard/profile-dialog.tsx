"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Shield, Star } from "lucide-react"
import { initialsOf } from "@repo/shared"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const REVIEW_POOL = [
  {
    initials: "TH",
    author: "Trần Huy",
    rating: 5,
    text: "Chơi rất ổn, đúng giờ và fair play. Kỹ thuật tốt, sẽ ghép cặp lại lần sau!",
    ago: "1 tuần trước",
  },
  {
    initials: "LL",
    author: "Lê Lan",
    rating: 5,
    text: "Đối tác tuyệt vời — kỹ thuật tốt và tinh thần thể thao rất cao. Highly recommend!",
    ago: "2 tuần trước",
  },
  {
    initials: "PQ",
    author: "Phạm Quân",
    rating: 4,
    text: "Chơi vui, giao lưu tốt. Phản xạ nhanh, kiên nhẫn với đồng đội mới.",
    ago: "3 tuần trước",
  },
  {
    initials: "ĐA",
    author: "Đỗ Anh",
    rating: 5,
    text: "Cực kỳ đáng tin cậy, chưa bao giờ bùng lịch hay đến trễ. Tôi rất ấn tượng!",
    ago: "1 tháng trước",
  },
  {
    initials: "VH",
    author: "Vũ Hà",
    rating: 4,
    text: "Trình độ ổn định, chiến thuật tốt. Chơi fair và luôn hỗ trợ đồng đội.",
    ago: "5 ngày trước",
  },
  {
    initials: "BK",
    author: "Bùi Khang",
    rating: 5,
    text: "Một trong những đối tác hay nhất tôi từng chơi cùng. Rất chuyên nghiệp và vui vẻ!",
    ago: "2 tháng trước",
  },
  {
    initials: "NM",
    author: "Nguyễn Minh",
    rating: 4,
    text: "Kỹ năng đồng đều, giao tiếp tốt trong trận. Biết điều chỉnh chiến thuật linh hoạt.",
    ago: "3 tuần trước",
  },
] as const
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthUser } from "@/components/dashboard/auth-user"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { LevelChip, SportDot } from "@/components/dashboard/shared"
import {
  readStoredAssessment,
  getRangeIndex,
  type PlayerAssessment,
} from "@/lib/player-assessment"

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const tSidebar = useTranslations("Sidebar")
  const tProfile = useTranslations("Profile")
  const tAssessment = useTranslations("Assessment")
  const tc = useTranslations("Common")
  const sUser = useAuthUser()
  const { userName } = useMatchmaking()
  const { user: USER } = useData()

  const [assessment, setAssessment] = React.useState<PlayerAssessment | null>(
    null
  )

  React.useEffect(() => {
    if (open) {
      const handle = setTimeout(() => {
        setAssessment(readStoredAssessment())
      }, 0)
      return () => clearTimeout(handle)
    }
  }, [open])

  const accountName = sUser.name || userName
  const accountSubtitle = sUser.email || USER.handle
  const accountImage = sUser.image || undefined
  const accountInitials = sUser.name ? initialsOf(sUser.name) : USER.initials

  const handleDisplay = accountSubtitle.includes("@")
    ? accountSubtitle
    : `@${accountSubtitle}`

  const bio = tProfile("bio")

  const badminton = assessment?.results?.badminton
  const pickleball = assessment?.results?.pickleball

  const reviewPool = REVIEW_POOL.filter((r) => r.initials !== USER.initials)
  const reviewSeed = USER.initials.split("").reduce((s, c) => s + c.charCodeAt(0), 0)
  const reviews = [0, 1, 2].map((i) => reviewPool[(reviewSeed + i) % reviewPool.length])
  const avgRating =
    Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 overflow-hidden max-h-[90svh] max-w-[calc(100%-2rem)] sm:max-w-md gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{tSidebar("profile")}</DialogTitle>
          <DialogDescription>
            {tProfile("dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Container */}
        <div className="overflow-y-auto no-scrollbar flex-1 min-h-0">
          {/* Cover Background Banner */}
          <div
            className="h-32 sm:h-36 w-full shrink-0 bg-linear-to-br from-brand via-lime/60 to-chart-3 bg-court-lines relative"
            aria-hidden="true"
          >
            {/* Overlay to blend gradient nicely */}
            <div className="absolute inset-0 bg-black/5" />
          </div>

          {/* Profile Card Body */}
          <div className="px-6 pb-6 sm:px-8 sm:pb-8 pt-0 relative flex flex-col">
          {/* Circular Avatar overlapping the banner */}
          <div className="relative -mt-10 mb-3 w-fit">
            <Avatar className="size-20 border-4 border-popover shadow-md bg-secondary">
              {accountImage ? (
                <AvatarImage src={accountImage} alt={accountName} />
              ) : null}
              <AvatarFallback className="bg-secondary text-lg font-bold text-secondary-foreground">
                {accountInitials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Identity details */}
          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-xl leading-tight font-bold text-foreground">
              {accountName}
            </h3>
            <p className="text-xs text-muted-foreground">{handleDisplay}</p>
          </div>

          {/* Bio / Description */}
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {bio}
          </p>

          {/* Current Levels */}
          <div className="mt-5 flex flex-col gap-3">
            <h4 className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {tProfile("yourLevel")}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Badminton Level Card */}
              <div className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-chart-3/20 bg-chart-3/5 p-3.5">
                <div className="absolute -right-3 -bottom-3 size-12 rounded-full bg-chart-3/10 blur-md transition-transform duration-300 group-hover:scale-125" />
                <div className="z-10 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-chart-3" />
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-chart-3 uppercase">
                    {tc("sports.badminton")}
                  </span>
                </div>
                <div className="z-10 mt-1">
                  <p className="font-heading text-base leading-tight font-bold text-foreground">
                    {badminton ? (
                      tAssessment(`badminton.ranges.r${getRangeIndex("badminton", badminton.score)}`)
                    ) : (
                      tProfile("notAssessed")
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {tProfile("points", { score: badminton ? badminton.score : 0 })}
                  </p>
                </div>
              </div>

              {/* Pickleball Level Card */}
              <div className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-lime/30 bg-lime/10 p-3.5">
                <div className="absolute -right-3 -bottom-3 size-12 rounded-full bg-lime/20 blur-md transition-transform duration-300 group-hover:scale-125" />
                <div className="z-10 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-lime" />
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-lime-foreground uppercase dark:text-lime">
                    {tc("sports.pickleball")}
                  </span>
                </div>
                <div className="z-10 mt-1">
                  <p className="font-heading text-base leading-tight font-bold text-foreground">
                    {pickleball ? (
                      tAssessment(`pickleball.ranges.r${getRangeIndex("pickleball", pickleball.score)}`)
                    ) : (
                      tProfile("notAssessed")
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {tProfile("points", { score: pickleball ? pickleball.score : 0 })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reliability / Trust Score */}
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-xs ring-1 ring-foreground/5 dark:ring-foreground/10">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
              <Shield className="size-3.5 text-brand" />
              {tProfile("reliability")}
            </span>
            <span className="font-mono font-bold text-brand tabular-nums">
              {USER.trust}%
            </span>
          </div>

          {/* Reviews */}
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {tProfile("reviewsLabel")}
              </h4>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "size-3",
                        i < Math.round(avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/25"
                      )}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] font-bold text-foreground tabular-nums">
                  {avgRating.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · {tProfile("ratingsCount", { count: reviews.length })}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {reviews.map((review, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3.5 ring-1 ring-foreground/5 dark:ring-foreground/10"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="bg-secondary text-[10px] font-bold text-secondary-foreground">
                        {review.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {review.author}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, j) => (
                          <Star
                            key={j}
                            className={cn(
                              "size-2.5",
                              j < review.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/25"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {review.ago}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {review.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PlayerProfileDialogProps {
  initials: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlayerProfileDialog({
  initials,
  open,
  onOpenChange,
}: PlayerProfileDialogProps) {
  const tProfile = useTranslations("Profile")
  const tc = useTranslations("Common")
  const { players, playerByInitials } = useData()

  const fullPlayer = initials
    ? players.find((p) => p.initials === initials)
    : null
  const rosterEntry = initials ? playerByInitials(initials) : null

  const name = fullPlayer?.name ?? rosterEntry?.name ?? initials ?? ""
  const level = fullPlayer?.level ?? rosterEntry?.level
  const trust = fullPlayer?.trust ?? rosterEntry?.trust ?? 0
  const sport = fullPlayer?.sport
  const matchPct = fullPlayer?.matchPct
  const distanceKm = fullPlayer?.distanceKm
  const online = fullPlayer?.online
  const blurb = fullPlayer?.blurb

  const pool = REVIEW_POOL.filter((r) => r.initials !== initials)
  const seed = (initials ?? "").split("").reduce((s, c) => s + c.charCodeAt(0), 0)
  const reviews = [0, 1, 2].map((i) => pool[(seed + i) % pool.length])
  const avgRating =
    Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 overflow-hidden max-h-[90svh] max-w-[calc(100%-2rem)] sm:max-w-md gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{tProfile("viewProfile")}</DialogTitle>
          <DialogDescription>
            {tProfile("playerDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Container */}
        <div className="overflow-y-auto no-scrollbar flex-1 min-h-0">
          {/* Cover Background Banner */}
          <div
            className="h-32 sm:h-36 w-full shrink-0 bg-linear-to-br from-brand via-lime/60 to-chart-3 bg-court-lines relative"
            aria-hidden="true"
          >
            <div className="absolute inset-0 bg-black/5" />
          </div>

          {/* Profile Card Body */}
          <div className="px-6 pb-6 sm:px-8 sm:pb-8 pt-0 relative flex flex-col">
          {/* Avatar overlapping banner */}
          <div className="relative -mt-10 mb-3 w-fit">
            <Avatar className="size-20 border-4 border-popover shadow-md bg-secondary">
              <AvatarFallback className="bg-secondary text-lg font-bold text-secondary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {online != null ? (
              <span
                className={cn(
                  "absolute bottom-1 right-1 size-3.5 rounded-full border-2 border-popover",
                  online ? "bg-brand" : "bg-muted-foreground/40"
                )}
              />
            ) : null}
          </div>

          {/* Identity */}
          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-xl leading-tight font-bold text-foreground">
              {name}
            </h3>
            <p className="text-xs text-muted-foreground">
              @{initials?.toLowerCase()}
            </p>
          </div>

          {/* Blurb */}
          {blurb ? (
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              {blurb}
            </p>
          ) : null}

          {/* Sport + Level */}
          {sport && level ? (
            <div className="mt-5 flex flex-col gap-3">
              <h4 className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {tProfile("playerLevel")}
              </h4>
              <div className="flex items-center gap-3 rounded-2xl border border-chart-3/20 bg-chart-3/5 p-3.5">
                <SportDot sport={sport} />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {tc(`sports.${sport}`)}
                  </span>
                  <LevelChip level={level} />
                </div>
                {matchPct != null ? (
                  <div className="ml-auto flex flex-col items-end">
                    <span className="font-mono text-sm font-bold text-brand tabular-nums">
                      {matchPct}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {tProfile("matchScore")}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Trust + Distance */}
          <div className="mt-3 flex gap-2">
            <div className="flex flex-1 items-center justify-between rounded-2xl bg-muted/40 p-3 text-xs ring-1 ring-foreground/5 dark:ring-foreground/10">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
                <Shield className="size-3.5 text-brand" />
                {tProfile("reliability")}
              </span>
              <span className="font-mono font-bold text-brand tabular-nums">
                {trust}%
              </span>
            </div>
            {distanceKm != null ? (
              <div className="flex items-center justify-center rounded-2xl bg-muted/40 px-3 py-2 ring-1 ring-foreground/5 dark:ring-foreground/10">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {tProfile("kmAway", { km: distanceKm })}
                </span>
              </div>
            ) : null}
          </div>

          {/* Reviews */}
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {tProfile("reviewsLabel")}
              </h4>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "size-3",
                        i < Math.round(avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/25"
                      )}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] font-bold text-foreground tabular-nums">
                  {avgRating.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · {tProfile("ratingsCount", { count: reviews.length })}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {reviews.map((review, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3.5 ring-1 ring-foreground/5 dark:ring-foreground/10"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="bg-secondary text-[10px] font-bold text-secondary-foreground">
                        {review.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {review.author}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, j) => (
                          <Star
                            key={j}
                            className={cn(
                              "size-2.5",
                              j < review.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/25"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {review.ago}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {review.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
