"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Flame,
  Footprints,
  Grid3x3,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { formatVnd, formatVndFull } from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useVenue } from "@/components/dashboard/venue/venue-provider"
import {
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  UTILIZATION_HEATMAP,
  locStr,
  type BookingSource,
  type VenueInsight,
} from "@/components/dashboard/venue/data"
import {
  Meter,
  MicroLabel,
  Ring,
  VenuePanel,
  VenueStat,
} from "@/components/dashboard/venue/shared"

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
  const {
    channelMix: CHANNEL_MIX,
    peakHours: PEAK_HOURS,
    revenueSeries: REVENUE_SERIES,
    sportMix: SPORT_MIX,
    venueStats: VENUE_STATS,
  } = useData()

  // ── Revenue rollup (deterministic — no Date/random) ──
  const weeklyTotal = REVENUE_SERIES.reduce((sum, d) => sum + d.value, 0)
  const revValues = REVENUE_SERIES.map((d) => d.value)
  const revLabels = REVENUE_SERIES.map((d) => locStr(d.label, locale))
  const lastIdx = REVENUE_SERIES.length - 1

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

      {/* AI adaptive pricing — minimal trigger tucked behind the stats */}
      <PriceMovesSheet />

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
                day: revLabels[revValues.indexOf(Math.max(...revValues))],
                amount: formatVnd(Math.max(...revValues)),
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
            <div className="mx-auto min-w-[17rem] max-w-[20rem]">
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
                {UTILIZATION_HEATMAP.map((row, d) => (
                  <div
                    key={d}
                    className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] items-center gap-1"
                  >
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      {locStr(HEATMAP_DAYS[d], locale)}
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
            {t("channels.note", { pct: CHANNEL_MIX[0].pct })}
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
    </div>
  )
}

/**
 * AI adaptive pricing — a minimal, understated trigger that sits just behind the
 * headline statistics. Opens a sheet of simple raise/lower price moves; applying
 * one nudges the live KPIs through {@link useVenue}.
 */
function PriceMovesSheet() {
  const t = useTranslations("VenuePricing")
  const locale = useLocale()
  const { priceSuggestions, applyInsight, dismissInsight, appliedCount } =
    useVenue()

  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 rounded-3xl bg-card px-4 py-3 text-left shadow-sm ring-1 ring-foreground/5 transition-colors hover:bg-muted/40 dark:ring-foreground/10"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime to-brand text-brand-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="truncate text-sm font-medium">{t("trigger")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {priceSuggestions.length ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-foreground tabular-nums">
              {priceSuggestions.length}
            </span>
          ) : null}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </SheetTrigger>

      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            {t("sheetTitle")}
          </SheetTitle>
          <SheetDescription>{t("sheetDescription")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {priceSuggestions.length ? (
            <ul className="flex flex-col gap-3">
              {priceSuggestions.map((s) => (
                <PriceMoveRow
                  key={s.id}
                  insight={s}
                  locale={locale}
                  onApply={() => applyInsight(s.id)}
                  onDismiss={() => dismissInsight(s.id)}
                  t={t}
                />
              ))}
            </ul>
          ) : (
            <PriceMovesEmpty t={t} />
          )}
        </div>

        {appliedCount > 0 ? (
          <SheetFooter className="border-t border-border/60 py-4">
            <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 text-brand" />
              {t("appliedCount", { count: appliedCount })}
            </p>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/** One minimal raise/lower price move with a before → after rate. */
function PriceMoveRow({
  insight,
  locale,
  onApply,
  onDismiss,
  t,
}: {
  insight: VenueInsight
  locale: string
  onApply: () => void
  onDismiss: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const move = insight.priceMove
  if (!move) return null
  const up = move.direction === "up"

  return (
    <li className="flex flex-col gap-3 rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            up ? "bg-brand/12 text-brand" : "bg-chart-2/15 text-chart-2"
          )}
        >
          {up ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {up ? t("increase") : t("decrease")}
        </span>
        <span
          className={cn(
            "font-heading text-sm font-bold tabular-nums",
            up ? "text-brand" : "text-chart-2"
          )}
        >
          {up ? "+" : "−"}
          {move.pct}%
        </span>
      </div>

      {insight.target ? (
        <p className="text-sm font-medium">{locStr(insight.target, locale)}</p>
      ) : null}

      {/* Current → suggested rate */}
      <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
        <span className="text-muted-foreground line-through">
          {formatVnd(move.from)}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span className="font-semibold">{formatVnd(move.to)}</span>
        <span className="text-xs text-muted-foreground">{t("perHour")}</span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand tabular-nums">
          <TrendingUp className="size-3.5" />
          {locStr(insight.impact, locale)}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={onDismiss}
          >
            {t("dismiss")}
          </Button>
          <Button size="sm" className="rounded-full" onClick={onApply}>
            {t("apply")}
          </Button>
        </div>
      </div>
    </li>
  )
}

/** Reassuring empty state when every price move has been decided. */
function PriceMovesEmpty({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand/12 text-brand">
        <Check className="size-6" />
      </span>
      <p className="font-heading text-base font-semibold">{t("emptyTitle")}</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {t("emptyDetail")}
      </p>
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
