"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Flame,
  Footprints,
  Grid3x3,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { formatVnd, formatVndFull } from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import { useVenueData } from "@/features/venue/venue-data-provider"
import {
  computeUtilizationHeatmap,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  heatmapRowLabels,
  locStr,
  utilizationHeatmap,
  type BookingSource,
  type InsightSeverity,
} from "@/features/venue/data"
import {
  Meter,
  MicroLabel,
  Ring,
  VenuePanel,
  VenueStat,
} from "@/features/venue/shared"

/** Severity → dot tint, staying on the existing risk-tier palette. */
const SEVERITY_DOT: Record<InsightSeverity, string> = {
  info: "bg-chart-2",
  warn: "bg-amber-500",
  critical: "bg-destructive",
}

const CHANNEL_ICON: Record<
  BookingSource,
  React.ComponentType<{ className?: string }>
> = {
  app: Smartphone,
  "walk-in": Footprints,
}

/** Per-sport ring tint, staying on the emerald/lime palette. */
const SPORT_RING: Record<string, string> = {
  badminton: "text-brand",
  pickleball: "text-chart-2",
}

export function VenueAnalyticsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const t = useTranslations("VenueAnalytics")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const { todayIso } = useData()
  const {
    channelMix: CHANNEL_MIX,
    peakHours: PEAK_HOURS,
    reservations: RESERVATIONS,
    revenueSeries: REVENUE_SERIES,
    sportMix: SPORT_MIX,
    venue: VENUE,
    venueCourts: VENUE_COURTS,
    venueInsights: VENUE_INSIGHTS,
    venueStats: VENUE_STATS,
  } = useVenueData()
  // A venue with a real operator gets real analytics end to end (server-side
  // series + a real heatmap here); AI insights below stay seeded either way.
  const isOwned = Boolean(VENUE.ownerId)

  // ── Revenue rollup (deterministic — no Date/random) ──
  const weeklyTotal = REVENUE_SERIES.reduce((sum, d) => sum + d.value, 0)
  const revValues = REVENUE_SERIES.map((d) => d.value)
  const revLabels = REVENUE_SERIES.map((d) => locStr(d.label, locale))
  const lastIdx = REVENUE_SERIES.length - 1
  // Peak day, guarded for an empty/zero series (Math.max([]) === -Infinity).
  const peakRevenue = revValues.length ? Math.max(...revValues) : 0
  const peakDayLabel = revValues.length
    ? (revLabels[revValues.indexOf(peakRevenue)] ?? "")
    : ""

  // Per-venue heatmap. An owned venue always gets its real heatmap (computed
  // from its own reservations — zeroed cells are an honest "no bookings yet"
  // rather than a fabricated pattern); a demo venue with no seeded activity
  // yet shows a zeroed grid instead of the flagship's hashed pattern.
  const hasActivity = weeklyTotal > 0
  const heatmap = isOwned
    ? computeUtilizationHeatmap(VENUE_COURTS, RESERVATIONS, todayIso)
    : hasActivity
      ? utilizationHeatmap(VENUE.id)
      : HEATMAP_DAYS.map(() => HEATMAP_HOURS.map(() => 0))
  const heatmapDayLabels = isOwned ? heatmapRowLabels(todayIso) : HEATMAP_DAYS

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <VenueStat
          label={t("kpi.revenue")}
          value={formatVnd(weeklyTotal)}
          delta={VENUE_STATS.revenueDelta}
          deltaSuffix="%"
          icon={TrendingUp}
        />
        <VenueStat
          label={t("kpi.utilization")}
          value={`${VENUE_STATS.utilization}`}
          unit="%"
          delta={VENUE_STATS.occupancyDelta}
          deltaSuffix="%"
          icon={BarChart3}
        />
        <VenueStat
          label={t("kpi.noShow")}
          value={`${VENUE_STATS.noShowRate}`}
          unit="%"
          delta={VENUE_STATS.noShowDelta}
          deltaSuffix="%"
          icon={Flame}
          invert
        />
        <VenueStat
          label={t("kpi.newCustomers")}
          value={`${VENUE_STATS.newCustomers}`}
          delta={VENUE_STATS.newCustomersDelta}
          icon={UserPlus}
        />
      </div>

      {/* Revenue + Heatmap */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Revenue (last 7 days) */}
        <VenuePanel
          title={t("revenue.title")}
          icon={TrendingUp}
          className="lg:col-span-3"
          action={
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                VENUE_STATS.revenueDelta >= 0
                  ? "text-brand"
                  : "text-destructive"
              )}
            >
              {VENUE_STATS.revenueDelta >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {VENUE_STATS.revenueDelta >= 0 ? "+" : ""}
              {VENUE_STATS.revenueDelta}%
            </span>
          }
        >
          <div className="flex flex-col gap-1">
            <MicroLabel>{t("revenue.weeklyTotal")}</MicroLabel>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-bold tracking-tight tabular-nums">
                {formatVndFull(weeklyTotal)}
              </span>
            </div>
          </div>
          <RevenueBars
            values={revValues}
            labels={revLabels}
            highlight={lastIdx}
          />
          <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-gradient-to-t from-brand to-lime" />
              {t("revenue.today")}
            </span>
            <span className="font-mono tabular-nums">
              {t("revenue.peakDay", {
                day: peakDayLabel,
                amount: formatVnd(peakRevenue),
              })}
            </span>
          </div>
        </VenuePanel>

        {/* Utilization heatmap — compact */}
        <VenuePanel
          title={t("heatmap.title")}
          icon={Grid3x3}
          className="lg:col-span-2"
          action={<MicroLabel>{t("heatmap.caption")}</MicroLabel>}
        >
          <div className="overflow-x-auto">
            <div className="mx-auto max-w-[20rem] min-w-[17rem]">
              {/* Column (hour) labels */}
              <div className="mb-1 grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1">
                <span />
                {HEATMAP_HOURS.map((h) => (
                  <span
                    key={h}
                    className="text-center font-mono text-[9px] tracking-wider text-muted-foreground tabular-nums"
                  >
                    {h}
                  </span>
                ))}
              </div>
              {/* Rows: one per day */}
              <div className="flex flex-col gap-1">
                {heatmap.map((row, d) => (
                  <div
                    key={d}
                    className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] items-center gap-1"
                  >
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      {locStr(heatmapDayLabels[d], locale)}
                    </span>
                    {row.map((v, h) => (
                      <HeatCell key={h} value={v} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Low → high scale legend */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t("heatmap.low")}</span>
              <span className="flex gap-0.5">
                {[0.12, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
                  <span
                    key={i}
                    className="size-3 rounded-[3px] bg-brand"
                    style={{ opacity: o }}
                  />
                ))}
              </span>
              <span>{t("heatmap.high")}</span>
            </span>
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase tabular-nums">
              {t("heatmap.unit")}
            </span>
          </div>
        </VenuePanel>
      </div>

      {/* Sport mix + Channels + Peak hours */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sport mix */}
        <VenuePanel title={t("sportMix.title")} icon={BarChart3}>
          <div className="flex items-center justify-center gap-6 py-2">
            {SPORT_MIX.map((s) => (
              <div key={s.sport} className="flex flex-col items-center gap-2">
                <Ring
                  pct={s.pct}
                  ringClassName={SPORT_RING[s.sport] ?? "text-brand"}
                >
                  <div className="text-center">
                    <span className="font-heading text-xl font-bold tabular-nums">
                      {s.pct}
                    </span>
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </Ring>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {tc(`sports.${s.sport}`)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {t("sportMix.bookings", { count: s.bookings })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            {SPORT_MIX.map((s) => (
              <div key={s.sport} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {tc(`sports.${s.sport}`)}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {s.pct}%
                  </span>
                </div>
                <Meter
                  pct={s.pct}
                  barClassName={
                    s.sport === "pickleball"
                      ? "bg-chart-2 from-chart-2 to-chart-2"
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </VenuePanel>

        {/* Booking channels */}
        <VenuePanel title={t("channels.title")} icon={Smartphone}>
          <div className="flex flex-col gap-4">
            {CHANNEL_MIX.map((c) => {
              const Icon = CHANNEL_ICON[c.source]
              return (
                <div key={c.source} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="font-medium">
                        {t(`channels.source.${c.source}`)}
                      </span>
                    </span>
                    <span className="font-heading text-lg font-bold tabular-nums">
                      {c.pct}
                      <span className="text-xs font-medium text-muted-foreground">
                        %
                      </span>
                    </span>
                  </div>
                  <Meter pct={c.pct} />
                </div>
              )
            })}
          </div>
          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {t("channels.note", { pct: CHANNEL_MIX[0]?.pct ?? 0 })}
          </p>
        </VenuePanel>

        {/* Peak hours */}
        <VenuePanel
          title={t("peak.title")}
          icon={Flame}
          action={<MicroLabel>{t("peak.caption")}</MicroLabel>}
        >
          <div className="flex flex-col gap-3">
            {PEAK_HOURS.map((p, i) => (
              <div key={p.hour} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2">
                    {i === 0 ? (
                      <Flame className="size-3.5 fill-lime/30 text-brand" />
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                    )}
                    <span className="font-mono font-medium tabular-nums">
                      {p.hour}
                    </span>
                  </span>
                  <span className="font-mono text-xs font-semibold text-brand tabular-nums">
                    {p.util}%
                  </span>
                </div>
                <Meter pct={p.util} />
              </div>
            ))}
          </div>
          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {t("peak.note")}
          </p>
        </VenuePanel>
      </div>

      {/* AI insights — always seeded sample content, never computed from real
          bookings (unlike the KPIs/charts above), so it always carries the
          "Demo AI" chip regardless of whether the venue is real or a demo. */}
      <VenuePanel
        title={t("insights.title")}
        icon={Sparkles}
        action={
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            {t("insights.demoChip")}
          </Badge>
        }
      >
        <p className="-mt-1 text-xs text-muted-foreground">
          {t("insights.subtitle")}
        </p>
        <div className="flex flex-col divide-y divide-border/60">
          {VENUE_INSIGHTS.map((insight) => (
            <div key={insight.id} className="flex items-start gap-3 py-3">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  SEVERITY_DOT[insight.severity]
                )}
              />
              <div className="flex flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {locStr(insight.title, locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locStr(insight.detail, locale)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] font-semibold text-brand tabular-nums">
                {locStr(insight.impact, locale)}
              </span>
            </div>
          ))}
        </div>
      </VenuePanel>
    </div>
  )
}


/**
 * Vertical revenue bars with VND value tooltips on top. Mirrors MiniBars but
 * shows the formatted amount above each bar and accents today.
 */
function RevenueBars({
  values,
  labels,
  highlight,
}: {
  values: number[]
  labels: string[]
  highlight: number
}) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span
            className={cn(
              "font-mono text-[10px] tabular-nums",
              i === highlight
                ? "font-semibold text-brand"
                : "text-muted-foreground"
            )}
          >
            {formatVnd(v)}
          </span>
          <div className="flex h-28 w-full items-end">
            <div
              className={cn(
                "w-full rounded-lg transition-all",
                i === highlight
                  ? "bg-gradient-to-t from-brand to-lime"
                  : "bg-brand/20"
              )}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A single heatmap cell — brand at an opacity scaled to the utilization. */
function HeatCell({ value }: { value: number }) {
  // Map 0–100 → 0.06–0.95 so even quiet cells read as a faint tile.
  const opacity = 0.06 + (Math.max(0, Math.min(100, value)) / 100) * 0.89
  const hot = value >= 80
  return (
    <div
      className={cn(
        "group/cell relative aspect-square w-full rounded-[4px] bg-muted/40 ring-1 ring-foreground/5 transition-transform ring-inset hover:scale-110 hover:ring-foreground/15",
        hot && "ring-lime/30"
      )}
      title={`${value}%`}
    >
      <div
        className="absolute inset-0 rounded-[4px] bg-brand"
        style={{ opacity }}
      />
      <span className="absolute inset-0 grid place-items-center font-mono text-[9px] font-semibold text-brand-foreground tabular-nums opacity-0 transition-opacity group-hover/cell:opacity-100">
        {value}
      </span>
    </div>
  )
}
