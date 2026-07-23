"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Flame,
  Footprints,
  Grid3x3,
  MoreHorizontal,
  Send,
  Smartphone,
  Snowflake,
  Sparkles,
  Tag,
  TrendingUp,
  UserPlus,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Link } from "@/i18n/navigation"
import { formatVnd, formatVndFull } from "@/features/dashboard/data"
import { useData } from "@/features/dashboard/data-provider"
import { venueBase } from "@/features/venue/nav"
import { addCourtBlock } from "@/features/venue/venue-actions"
import { useVenueData } from "@/features/venue/venue-data-provider"
import {
  COLD_SLOT_THRESHOLD,
  COURT_BLOCK_REASONS,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  computeColdSlots,
  computeHourCoverage,
  computeWeekdayHeatmap,
  locStr,
  weekdayCoverageFromHeatmap,
  nextDateForWeekday,
  type BookingSource,
  type ColdSlot,
  type CourtBlock,
  type CourtBlockReason,
  type InsightSeverity,
  type VenueCourt,
} from "@/features/venue/data"
import {
  Meter,
  MicroLabel,
  Ring,
  VenueEmpty,
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
}

export function VenueAnalyticsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const t = useTranslations("VenueAnalytics")
  const tc = useTranslations("Common")
  const tSchedule = useTranslations("VenueSchedule")
  const locale = useLocale()
  const { todayIso } = useData()
  const {
    venueId,
    channelMix: CHANNEL_MIX,
    reservations: RESERVATIONS,
    revenueSeries: REVENUE_SERIES,
    sportMix: SPORT_MIX,
    venueCourts: VENUE_COURTS,
    venueInsights: VENUE_INSIGHTS,
    venueStats: VENUE_STATS,
    addBlock,
  } = useVenueData()

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

  // Real weekday × hour occupancy — averaged across every date on record for
  // that weekday, so a recurring quiet slot reads as quiet even with only a
  // few weeks of history. Zeroed cells for a bare venue are an honest "no
  // bookings yet" rather than a fabricated pattern.
  const weekdayHeatmap = React.useMemo(
    () => computeWeekdayHeatmap(VENUE_COURTS, RESERVATIONS),
    [VENUE_COURTS, RESERVATIONS]
  )
  const hourCoverage = React.useMemo(
    () => computeHourCoverage(VENUE_COURTS, RESERVATIONS),
    [VENUE_COURTS, RESERVATIONS]
  )
  const weekdayCoverage = React.useMemo(
    () => weekdayCoverageFromHeatmap(weekdayHeatmap),
    [weekdayHeatmap]
  )
  // Cold slots only mean something once there's real occupancy to compare
  // against — an all-zero grid (a venue with no bookings on record, or none in
  // the visible hour window) has no "quiet" cells to surface, just no data.
  const hasActivity = React.useMemo(
    () => weekdayHeatmap.some((row) => row.some((v) => v > 0)),
    [weekdayHeatmap]
  )
  const coldSlots = React.useMemo(
    () => (hasActivity ? computeColdSlots(weekdayHeatmap, HEATMAP_HOURS) : []),
    [hasActivity, weekdayHeatmap]
  )
  const [coverageView, setCoverageView] = React.useState<"hour" | "weekday">(
    "hour"
  )

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      ) : null}

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
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

        <VenuePanel
          title={t("coverage.title")}
          icon={BarChart3}
          className="lg:col-span-2"
          action={
            <Tabs
              value={coverageView}
              onValueChange={(v) => setCoverageView(v as "hour" | "weekday")}
            >
              <TabsList className="h-7">
                <TabsTrigger value="hour" className="px-2 text-[11px]">
                  {t("coverage.toggleHour")}
                </TabsTrigger>
                <TabsTrigger value="weekday" className="px-2 text-[11px]">
                  {t("coverage.toggleWeekday")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <MicroLabel>{t("coverage.caption")}</MicroLabel>
          <CoverageBars
            values={
              coverageView === "hour"
                ? hourCoverage.map((p) => p.util)
                : weekdayCoverage.map((p) => p.util)
            }
            labels={
              coverageView === "hour"
                ? hourCoverage.map((p) => p.hour.slice(0, 2))
                : HEATMAP_DAYS.map((d) => locStr(d, locale))
            }
          />
          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {t("coverage.note")}
          </p>
        </VenuePanel>
      </div>

      <VenuePanel
        title={t("heatmap.title")}
        icon={Grid3x3}
        action={<MicroLabel>{t("heatmap.caption")}</MicroLabel>}
      >
        <p className="-mt-1 text-xs text-muted-foreground">
          {t("heatmap.explain")}
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[34rem]">
            <div className="mb-1 grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-1">
              <span />
              {HEATMAP_HOURS.map((h) => (
                <span
                  key={h}
                  className="text-center font-mono text-[10px] tracking-wider text-muted-foreground tabular-nums"
                >
                  {h}
                </span>
              ))}
            </div>
            {/* Rows: one per weekday, Mon → Sun */}
            <div className="flex flex-col gap-1">
              {weekdayHeatmap.map((row, d) => (
                <div
                  key={d}
                  className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] items-center gap-1"
                >
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {locStr(HEATMAP_DAYS[d], locale)}
                  </span>
                  {row.map((v, h) => (
                    <HeatCell
                      key={h}
                      value={v}
                      cold={coldSlots.some(
                        (s) => s.weekdayIdx === d && s.hour === HEATMAP_HOURS[h]
                      )}
                      label={`${locStr(HEATMAP_DAYS[d], locale)} · ${HEATMAP_HOURS[h]}:00 · ${v}%`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
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
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full ring-2 ring-amber-500/60" />
              {t("heatmap.coldMarker")}
            </span>
          </span>
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase tabular-nums">
            {t("heatmap.unit")}
          </span>
        </div>
      </VenuePanel>

      <ColdSlotsPanel
        coldSlots={coldSlots}
        hasActivity={hasActivity}
        locale={locale}
        todayIso={todayIso}
        venueId={venueId}
        courts={VENUE_COURTS}
        onBlocked={addBlock}
        t={t}
        tSchedule={tSchedule}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                <Meter pct={s.pct} />
              </div>
            ))}
          </div>
        </VenuePanel>

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

/** Vertical percentage bars — a quiet (≤ threshold) column reads amber, not brand. */
function CoverageBars({
  values,
  labels,
}: {
  values: number[]
  labels: string[]
}) {
  return (
    <div className="flex items-end gap-1">
      {values.map((v, i) => {
        const cold = v <= COLD_SLOT_THRESHOLD
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-[10px] tabular-nums",
                cold ? "font-semibold text-amber-600" : "text-muted-foreground"
              )}
            >
              {v}%
            </span>
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-lg transition-all",
                  cold
                    ? "bg-amber-500/25"
                    : "bg-gradient-to-t from-brand to-lime"
                )}
                style={{ height: `${Math.max(4, v)}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {labels[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A single heatmap cell — brand at an opacity scaled to the utilization. */
function HeatCell({
  value,
  cold,
  label,
}: {
  value: number
  cold?: boolean
  label: string
}) {
  // Map 0–100 → 0.06–0.95 so even quiet cells read as a faint tile.
  const opacity = 0.06 + (Math.max(0, Math.min(100, value)) / 100) * 0.89
  const hot = value >= 80
  const cell = (
    <div
      className={cn(
        "group/cell relative aspect-square w-full rounded-[4px] bg-muted/40 ring-1 ring-foreground/5 transition-transform ring-inset hover:scale-110 hover:ring-foreground/15",
        hot && "ring-lime/30",
        cold && "ring-2 ring-amber-500/50"
      )}
    >
      <div
        className="absolute inset-0 rounded-[4px] bg-brand"
        style={{ opacity }}
      />
      {cold ? (
        <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500" />
      ) : null}
      <span className="absolute inset-0 grid place-items-center font-mono text-[9px] font-semibold text-brand-foreground tabular-nums opacity-0 transition-opacity group-hover/cell:opacity-100">
        {value}
      </span>
    </div>
  )
  return (
    <Tooltip>
      <TooltipTrigger render={cell} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The operator's action list for the quietest weekday × hour cells. */
function ColdSlotsPanel({
  coldSlots,
  hasActivity,
  locale,
  todayIso,
  venueId,
  courts,
  onBlocked,
  t,
  tSchedule,
}: {
  coldSlots: ColdSlot[]
  hasActivity: boolean
  locale: string
  todayIso: string
  venueId: string
  courts: VenueCourt[]
  onBlocked: (block: CourtBlock) => void
  t: ReturnType<typeof useTranslations>
  tSchedule: ReturnType<typeof useTranslations>
}) {
  const [blockTarget, setBlockTarget] = React.useState<ColdSlot | null>(null)

  return (
    <VenuePanel
      title={t("coldSlots.title")}
      icon={Snowflake}
      action={<MicroLabel>{t("coldSlots.caption")}</MicroLabel>}
    >
      <p className="-mt-1 text-xs text-muted-foreground">
        {t("coldSlots.subtitle")}
      </p>
      {coldSlots.length ? (
        <div className="flex flex-col divide-y divide-border/60">
          {coldSlots.map((slot) => (
            <ColdSlotRow
              key={`${slot.weekdayIdx}-${slot.hour}`}
              slot={slot}
              locale={locale}
              todayIso={todayIso}
              venueId={venueId}
              onRequestBlock={() => setBlockTarget(slot)}
              t={t}
            />
          ))}
        </div>
      ) : (
        <VenueEmpty
          text={hasActivity ? t("coldSlots.allHealthy") : t("coldSlots.empty")}
        />
      )}
      <ColdSlotBlockDialog
        target={blockTarget}
        locale={locale}
        todayIso={todayIso}
        venueId={venueId}
        courts={courts}
        onClose={() => setBlockTarget(null)}
        onCreated={(block) => {
          onBlocked(block)
          setBlockTarget(null)
        }}
        t={t}
        tSchedule={tSchedule}
      />
    </VenuePanel>
  )
}

function ColdSlotRow({
  slot,
  locale,
  todayIso,
  venueId,
  onRequestBlock,
  t,
}: {
  slot: ColdSlot
  locale: string
  todayIso: string
  venueId: string
  onRequestBlock: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const dayLabel = locStr(HEATMAP_DAYS[slot.weekdayIdx], locale)
  const endHour = String(Number(slot.hour) + 2).padStart(2, "0")
  const slotLabel = `${dayLabel} · ${slot.hour}:00–${endHour}:00`
  const reasonKey = slot.util <= 10 ? "veryLow" : "low"
  const resolvedDate = nextDateForWeekday(slot.weekdayIdx, todayIso)
  const suggestedPct = slot.util <= 10 ? 25 : slot.util <= 20 ? 20 : 15

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {slotLabel}
          </span>
          <span className="font-mono text-[11px] font-semibold text-amber-600 tabular-nums">
            {slot.util}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(`coldSlots.reason.${reasonKey}`, { pct: slot.util })}
        </p>
      </div>
      <Popover>
        <PopoverTrigger
          nativeButton
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <MoreHorizontal className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <div className="flex flex-col gap-3">
            <div>
              <MicroLabel>{t("coldSlots.actionsTitle")}</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{slotLabel}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                className="w-full justify-start rounded-full"
                onClick={onRequestBlock}
              >
                <Wrench />
                {t("coldSlots.actions.block")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start rounded-full"
                nativeButton={false}
                render={
                  <Link
                    href={`${venueBase(venueId)}/schedule?day=${resolvedDate}`}
                  />
                }
              >
                <CalendarRange />
                {t("coldSlots.actions.openSchedule")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start rounded-full text-muted-foreground"
                onClick={() =>
                  toast(t("coldSlots.toast.promoTitle"), {
                    description: t("coldSlots.toast.promoDesc", {
                      slot: slotLabel,
                      pct: suggestedPct,
                    }),
                  })
                }
              >
                <Tag />
                {t("coldSlots.actions.promo")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start rounded-full text-muted-foreground"
                onClick={() =>
                  toast(t("coldSlots.toast.inviteTitle"), {
                    description: t("coldSlots.toast.inviteDesc", {
                      slot: slotLabel,
                    }),
                  })
                }
              >
                <Send />
                {t("coldSlots.actions.invite")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * Close off a cold slot with a required reason — a venue-level counterpart to
 * `schedule.tsx`'s per-court `BlockDialog`, with a court picker since a cold
 * slot is a venue-wide aggregate rather than one court's grid cell. Always the
 * next real calendar date matching the slot's weekday, and the heatmap's
 * 2-hour column width as the block's duration.
 */
function ColdSlotBlockDialog({
  target,
  locale,
  todayIso,
  venueId,
  courts,
  onClose,
  onCreated,
  t,
  tSchedule,
}: {
  target: ColdSlot | null
  locale: string
  todayIso: string
  venueId: string
  courts: VenueCourt[]
  onClose: () => void
  onCreated: (block: CourtBlock) => void
  t: ReturnType<typeof useTranslations>
  tSchedule: ReturnType<typeof useTranslations>
}) {
  const bookableCourts = React.useMemo(
    () => courts.filter((c) => !c.archived),
    [courts]
  )
  const [courtId, setCourtId] = React.useState(bookableCourts[0]?.id ?? "")
  const [reason, setReason] = React.useState<CourtBlockReason>("internal")
  const [note, setNote] = React.useState("")
  const [isPending, startTransition] = React.useTransition()

  const [prevTarget, setPrevTarget] = React.useState<typeof target>(null)
  if (target !== prevTarget) {
    setPrevTarget(target)
    if (target) {
      setCourtId(bookableCourts[0]?.id ?? "")
      setReason("internal")
      setNote("")
    }
  }

  const durationMin = 120
  const resolvedDate = target
    ? nextDateForWeekday(target.weekdayIdx, todayIso)
    : ""
  const start = target ? `${target.hour}:00` : ""
  const dayLabel = target ? locStr(HEATMAP_DAYS[target.weekdayIdx], locale) : ""
  const slotLabel = target ? `${dayLabel} · ${start} · ${resolvedDate}` : ""

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target || !courtId) return
    startTransition(async () => {
      try {
        const block = await addCourtBlock(venueId, {
          courtId,
          dateKey: resolvedDate,
          start,
          durationMin,
          reason,
          note: note.trim() || undefined,
        })
        onCreated(block)
        toast.success(tSchedule("toast.blockTitle"), {
          description: slotLabel,
        })
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to block slot"
        )
      }
    })
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("coldSlots.dialog.title")}</DialogTitle>
          <DialogDescription>{slotLabel}</DialogDescription>
        </DialogHeader>
        {target ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("coldSlots.dialog.court")}
              <Select
                value={courtId}
                onValueChange={(v) => setCourtId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => bookableCourts.find((c) => c.id === v)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {bookableCourts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {tSchedule("blockDialog.reasonLabel")}
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as CourtBlockReason)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => tSchedule(`blockReasons.${v as CourtBlockReason}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COURT_BLOCK_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tSchedule(`blockReasons.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {tSchedule("blockDialog.noteLabel")}
              <Input
                value={note}
                placeholder={tSchedule("blockDialog.notePlaceholder")}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("coldSlots.dialog.cancel")}
              </Button>
              <Button type="submit" disabled={isPending || !courtId}>
                {t("coldSlots.dialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
