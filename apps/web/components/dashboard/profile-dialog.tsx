"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Shield } from "lucide-react"
import { initialsOf } from "@repo/shared"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-[calc(100%-2rem)] sm:max-w-md gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{tSidebar("profile")}</DialogTitle>
          <DialogDescription>
            {tProfile("dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Cover Background Banner */}
        <div
          className="h-32 sm:h-36 w-full bg-gradient-to-br from-brand via-lime/60 to-chart-3 bg-court-lines relative"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
