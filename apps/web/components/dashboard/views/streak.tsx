"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Award,
  Crown,
  Flame,
  Medal,
  Moon,
  Target,
  Trophy,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useData } from "@/components/dashboard/data-provider"
import { StreakStrip } from "@/components/dashboard/shared"

const HEAT = ["bg-muted", "bg-brand/30", "bg-brand/60", "bg-brand"]

const MILESTONES: {
  key: string
  icon: React.ComponentType<{ className?: string }>
  unlocked: boolean
}[] = [
  { key: "firstServe", icon: Medal, unlocked: true },
  { key: "weekWarrior", icon: Flame, unlocked: true },
  { key: "fortnight", icon: Crown, unlocked: true },
  { key: "allRounder", icon: Zap, unlocked: true },
  { key: "hotHand", icon: Award, unlocked: false },
  { key: "nightOwl", icon: Moon, unlocked: false },
]

export function StreakView() {
  const t = useTranslations("Streak")
  const { streak: STREAK } = useData()
  const activeDays = STREAK.history.filter((h) => h > 0).length

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-4xl bg-card p-6 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-lime/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex items-center gap-5">
            <div className="grid size-20 shrink-0 place-items-center rounded-4xl bg-gradient-to-b from-lime to-brand text-brand-foreground shadow-md">
              <Flame className="size-9" />
            </div>
            <div>
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                {t("currentStreak")}
              </span>
              <div className="flex items-end gap-2">
                <span className="font-heading text-6xl leading-[0.8] font-bold tabular-nums">
                  {STREAK.current}
                </span>
                <span className="mb-1.5 text-sm text-muted-foreground">
                  {t("daysUnit")}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("longestLabel")}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {t("daysCount", { count: STREAK.longest })}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:border-l lg:border-border/60 lg:pl-6">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Target className="size-4" />
                {t("weeklyGoal")}
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {t("weeklyProgress", {
                  done: STREAK.weeklyDone,
                  goal: STREAK.weeklyGoal,
                })}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime to-brand"
                style={{
                  width: `${(STREAK.weeklyDone / STREAK.weeklyGoal) * 100}%`,
                }}
              />
            </div>
            <StreakStrip days={STREAK.week} size="lg" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MiniStat
          label={t("longestStreak")}
          value={STREAK.longest}
          unit={t("daysUnit")}
          icon={Crown}
        />
        <MiniStat
          label={t("activeDays")}
          value={activeDays}
          unit={t("daysUnit")}
          icon={Flame}
        />
        <MiniStat
          label={t("goalHitRate")}
          value={Math.round((STREAK.weeklyDone / STREAK.weeklyGoal) * 100)}
          unit="%"
          icon={Target}
        />
      </div>

      {/* Heatmap */}
      <section className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
            <Flame className="size-4 text-muted-foreground" />
            {t("last12Weeks")}
          </h2>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            {t("less")}
            {HEAT.map((c, i) => (
              <span key={i} className={cn("size-2.5 rounded-[3px]", c)} />
            ))}
            {t("more")}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
            {STREAK.history.map((v, i) => (
              <span
                key={i}
                className={cn("size-3.5 rounded-[4px]", HEAT[v])}
                title={v > 0 ? t("matchesCount", { count: v }) : t("restDay")}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
          <Trophy className="size-4 text-muted-foreground" />
          {t("milestones")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MILESTONES.map((m) => (
            <div
              key={m.key}
              className={cn(
                "flex items-center gap-3 rounded-3xl p-3 ring-1",
                m.unlocked
                  ? "bg-secondary/60 ring-border"
                  : "bg-muted/40 opacity-60 ring-transparent"
              )}
            >
              <div
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-2xl",
                  m.unlocked
                    ? "bg-gradient-to-b from-lime to-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <m.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {t(`milestoneList.${m.key}.label`)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`milestoneList.${m.key}.hint`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function MiniStat({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string
  value: number
  unit: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col gap-2 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground/70" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-heading text-4xl leading-none font-bold tabular-nums">
          {value}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  )
}
