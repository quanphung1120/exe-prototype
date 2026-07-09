"use client"

import * as React from "react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarPlus,
  CircleDollarSign,
  Clock,
  LayoutGrid,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatVnd } from "@/features/dashboard/data"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { checkInReservation } from "@/features/venue/venue-actions"
import { SportTag } from "@/features/dashboard/shared"
import { useVenue } from "@/features/venue/venue-provider"
import {
  MicroLabel,
  Ring,
  Sparkline,
  VenueEmpty,
  VenuePanel,
  VenueStat,
} from "@/features/venue/shared"
import {
  courtStateAccent,
  locStr,
  type CourtState,
  type Reservation,
} from "@/features/venue/data"

export function VenueCommandView() {
  const t = useTranslations("VenueCommand")
  const locale = useLocale()
  const {
    revenueSeries: REVENUE_SERIES,
    reservations: RESERVATIONS,
    venue: VENUE,
    venueCourts: VENUE_COURTS,
  } = useVenueData()
  const { stats } = useVenue()

  // Today's arrivals still to come through the door.
  const arrivals = RESERVATIONS.filter(
    (r) =>
      r.day.en === "Today" &&
      (r.status === "confirmed" || r.status === "checked-in")
  )

  const revenueValues = REVENUE_SERIES.map((d) => d.value)
  const todayIdx = REVENUE_SERIES.length - 1
  const todayRevenue = REVENUE_SERIES[todayIdx]?.value ?? 0

  const courtStateLabel: Record<CourtState, string> = {
    "in-play": t("state.inPlay"),
    upcoming: t("state.upcoming"),
    available: t("state.available"),
    maintenance: t("state.maintenance"),
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("greeting", { manager: VENUE.manager.name })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { venue: VENUE.name })}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          <span className="relative flex size-2">
            <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          {t("asOf", { time: VENUE.now })}
        </p>
      </div>

      {/* ── KPI row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <VenueStat
          label={t("kpi.occupancy")}
          value={String(stats.occupancy)}
          unit="%"
          delta={stats.occupancyDelta}
          deltaSuffix="%"
          icon={LayoutGrid}
        />
        <VenueStat
          label={t("kpi.revenueToday")}
          value={formatVnd(stats.revenueToday)}
          delta={stats.revenueDelta}
          deltaSuffix="%"
          icon={CircleDollarSign}
        />
        <VenueStat
          label={t("kpi.bookingsToday")}
          value={String(stats.bookingsToday)}
          delta={stats.bookingsDelta}
          icon={CalendarPlus}
        />
        <VenueStat
          label={t("kpi.noShowRate")}
          value={String(stats.noShowRate)}
          unit="%"
          delta={stats.noShowDelta}
          deltaSuffix="%"
          invert
          icon={UserCheck}
        />
      </div>

      {/* ── Courts now (signature hero) ────────────────────────────── */}
      <section className="relative overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
        <div
          aria-hidden
          className="bg-court-lines pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_120%_at_85%_0%,#000_0%,transparent_60%)] opacity-70"
        />
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
                <LayoutGrid className="size-4 text-muted-foreground" />
                {t("courtsNow")}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <MicroLabel>{t("liveOccupancy")}</MicroLabel>
                <span className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {t("courtsLive", {
                    live: VENUE_COURTS.filter((c) => c.state === "in-play")
                      .length,
                    total: VENUE_COURTS.length,
                  })}
                </span>
              </div>
              <Ring pct={stats.occupancy} size={84} thickness={9}>
                <div className="text-center leading-none">
                  <span className="font-heading text-xl font-bold tabular-nums">
                    {stats.occupancy}
                  </span>
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </Ring>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VENUE_COURTS.map((court) => {
              const live = court.state === "in-play"
              return (
                <div
                  key={court.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-3xl bg-background/60 p-4 ring-1 backdrop-blur-sm transition-colors",
                    live
                      ? "ring-brand/25"
                      : "ring-foreground/5 dark:ring-foreground/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-semibold">
                      {court.name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        courtStateAccent[court.state]
                      )}
                    >
                      {live ? (
                        <span className="relative flex size-1.5">
                          <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                        </span>
                      ) : court.state === "maintenance" ? (
                        <Wrench className="size-3" />
                      ) : null}
                      {courtStateLabel[court.state]}
                    </span>
                  </div>
                  <SportTag sport={court.sport} />
                  <div className="mt-auto min-h-9 border-t border-border/60 pt-2">
                    {court.state === "maintenance" ? (
                      <p className="text-xs text-destructive">
                        {t("courtMaintenance")}
                      </p>
                    ) : court.occupant ? (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium">
                          {court.occupant}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-muted-foreground tabular-nums">
                          <Clock className="size-3" />
                          {court.state === "upcoming"
                            ? t("courtFrom", { time: court.until ?? "" })
                            : t("courtUntil", { time: court.until ?? "" })}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("courtOpen")}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>



      {/* ── Arrivals + revenue ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Upcoming arrivals */}
        <VenuePanel
          title={t("upcomingArrivals")}
          icon={Users}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={
                <Link href="/dashboard/venue/schedule?tab=reservations" />
              }
            >
              {t("seeAll")}
            </Button>
          }
        >
          {arrivals.length ? (
            <div className="flex flex-col gap-1">
              {arrivals.map((rv) => (
                <ArrivalRow key={rv.id} rv={rv} checkInLabel={t("checkIn")} />
              ))}
            </div>
          ) : (
            <VenueEmpty text={t("emptyArrivals")} />
          )}
        </VenuePanel>

        {/* Revenue this week */}
        <VenuePanel title={t("revenueWeek")} icon={CircleDollarSign}>
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <MicroLabel>{t("today")}</MicroLabel>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
                    {formatVnd(todayRevenue)}
                  </span>
                  <RevenueDelta delta={stats.revenueDelta} />
                </div>
              </div>
              <Ring pct={stats.utilization} size={64} thickness={7}>
                <span className="font-heading text-sm font-bold tabular-nums">
                  {stats.utilization}%
                </span>
              </Ring>
            </div>

            <Sparkline values={revenueValues} className="h-10" />

            <div className="flex items-center justify-between">
              {REVENUE_SERIES.map((d, i) => (
                <span
                  key={i}
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    i === todayIdx
                      ? "font-bold text-brand"
                      : "text-muted-foreground"
                  )}
                >
                  {locStr(d.label, locale)}
                </span>
              ))}
            </div>

            <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {t("revenueCaption", { util: stats.utilization })}
            </p>
          </div>
        </VenuePanel>
      </div>
    </div>
  )
}

/** Signed week-over-week revenue delta chip. */
function RevenueDelta({ delta }: { delta: number }) {
  const up = delta >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        up ? "text-brand" : "text-destructive"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5" />
      ) : (
        <ArrowDownRight className="size-3.5" />
      )}
      {up ? "+" : ""}
      {delta}%
    </span>
  )
}

/** One upcoming-arrival line with a cosmetic check-in action. */
function ArrivalRow({
  rv,
  checkInLabel,
}: {
  rv: Reservation
  checkInLabel: string
}) {
  const t = useTranslations("VenueCommand")
  const { venueId, updateReservation } = useVenueData()
  // Optimistic check-in for instant feedback; the server action persists the
  // status and `updateReservation` folds it into the shared reservation data.
  const [justCheckedIn, setJustCheckedIn] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()
  const checkedIn = rv.status === "checked-in" || justCheckedIn

  const checkIn = () => {
    setJustCheckedIn(true)
    startTransition(async () => {
      try {
        await checkInReservation(venueId, rv.id)
        updateReservation(rv.id, { status: "checked-in" })
        toast.success(t("checkedIn"), { description: rv.customer.name })
      } catch (error) {
        setJustCheckedIn(false)
        toast.error(
          error instanceof Error ? error.message : "Failed to check in"
        )
      }
    })
  }
  return (
    <div className="flex items-center gap-3 rounded-3xl p-2 transition-colors hover:bg-muted/60">
      <Avatar>
        <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
          {rv.customer.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{rv.customer.name}</span>
          {checkedIn ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-2 py-0.5 text-[10px] font-semibold text-brand">
              <UserCheck className="size-3" />
              {t("checkedIn")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
          <SportTag sport={rv.sport} />
          <span aria-hidden>·</span>
          <span>{rv.court}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Users className="size-3" />
            {rv.party}
          </span>
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {rv.time.split(" – ")[0]}
        </span>
      </div>
      {checkedIn ? null : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          disabled={isPending}
          onClick={checkIn}
        >
          {checkInLabel}
        </Button>
      )}
    </div>
  )
}
